import fs from 'fs'
import path from 'path'
import http from 'http'
import os from 'os'
import crypto from 'crypto'
import { pathToFileURL } from 'url'
import { Bot, h, Logger } from 'koishi'

export interface PushOptions {
  channelId: string
  filePath: string
  title: string
  fileName?: string
  magnetUrl?: string
  videoSizeThresholdMB?: number
  uploadTimeoutMs?: number
  logger?: Logger
  serverHost?: string
  serverPort?: number
}

export interface PushResult {
  success: boolean
  mode: 'video' | 'group_file' | 'fallback_magnet'
  error?: string
}

/**
 * Finds the best local IP address matching the remote host's subnet.
 */
export function getLocalIpForRemote(remoteHost: string): string {
  if (['127.0.0.1', 'localhost', '::1'].includes(remoteHost)) {
    return '127.0.0.1'
  }

  const interfaces = os.networkInterfaces()
  const remoteParts = remoteHost.split('.').slice(0, 3).join('.')

  // 1. Same /24 subnet match (e.g. ZeroTier, LAN, Tailscale)
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.split('.').slice(0, 3).join('.') === remoteParts) {
          return net.address
        }
      }
    }
  }

  // 2. Fallback to any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }

  return '127.0.0.1'
}

/**
 * Spawns a lightweight, token-protected temporary HTTP file streaming server.
 * Streams directly from disk with zero memory buffering.
 */
export async function createTemporaryFileServer(
  filePath: string,
  preferredHost = '127.0.0.1',
  preferredPort = 0,
  logger?: Logger
): Promise<{ url: string; close: () => void }> {
  const token = crypto.randomBytes(8).toString('hex')
  const baseName = path.basename(filePath)
  const encodedName = encodeURIComponent(baseName)
  const stat = await fs.promises.stat(filePath)
  const fileSize = stat.size
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1)

  const server = http.createServer((req, res) => {
    const reqUrl = req.url || ''
    if (!reqUrl.includes(token)) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileSize,
      'Content-Disposition': `attachment; filename="${encodedName}"`,
      'Accept-Ranges': 'bytes',
    })

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
    res.on('finish', () => {
      logger?.info?.(
        `[push] Video stream fully transferred to OneBot adapter (${fileSizeMB}MB). Waiting for adapter to finish uploading to QQ group...`
      )
    })
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })

  // Set generous timeout to prevent connection drop during large file transfers
  server.setTimeout(30 * 60 * 1000)

  await new Promise<void>((resolve, reject) => {
    server.listen(preferredPort, '0.0.0.0', () => resolve())
    server.on('error', reject)
  })

  const addr = server.address() as any
  const port = addr.port
  const url = `http://${preferredHost}:${port}/${token}/${encodedName}`

  return {
    url,
    close: () => {
      try {
        server.close()
      } catch {}
    },
  }
}

/**
 * Invokes a OneBot v11 action with a custom extended timeout (default 10 minutes),
 * bypassing Koishi OneBot adapter's 60s hardcoded timeout for large file uploads.
 */
export async function invokeOneBotAction(
  bot: Bot,
  action: string,
  params: any,
  timeoutMs = 10 * 60 * 1000,
  logger?: Logger
): Promise<any> {
  const socket = (bot.adapter as any)?.socket || (bot as any)?.socket

  if (socket && typeof socket.send === 'function') {
    const echo = `rss_anime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return new Promise((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (typeof socket.removeEventListener === 'function') {
          socket.removeEventListener('message', onMessage)
        } else if (typeof socket.off === 'function') {
          socket.off('message', onMessage)
        }
      }

      const timer = setTimeout(() => {
        cleanup()
        reject(
          new Error(
            `Timeout with request ${action} after ${Math.round(timeoutMs / 1000)}s`
          )
        )
      }, timeoutMs)

      const onMessage = (event: any) => {
        try {
          const raw =
            typeof event?.data === 'string'
              ? event.data
              : event?.data
                ? event.data.toString()
                : typeof event === 'string'
                  ? event
                  : event?.toString?.()
          if (!raw) return
          const parsed = JSON.parse(raw)
          if (parsed && String(parsed.echo) === echo) {
            cleanup()
            if (parsed.retcode === 0 || parsed.status === 'ok') {
              resolve(parsed.data)
            } else {
              reject(
                new Error(
                  `Error with request ${action}, retcode: ${parsed.retcode}, message: ${
                    parsed.message || parsed.wording || 'unknown error'
                  }`
                )
              )
            }
          }
        } catch {}
      }

      if (typeof socket.addEventListener === 'function') {
        socket.addEventListener('message', onMessage)
      } else if (typeof socket.on === 'function') {
        socket.on('message', onMessage)
      }

      try {
        socket.send(JSON.stringify({ action, params, echo }))
      } catch (err) {
        cleanup()
        reject(err)
      }
    })
  }

  // Fallback: Use standard bot.internal method
  const uploadFn =
    (bot.internal as any)?.[action] ||
    (bot.internal as any)?.[action.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]
  if (typeof uploadFn === 'function') {
    return uploadFn.call(bot.internal, params.group_id, params.file, params.name)
  }

  throw new Error(`OneBot action ${action} is not supported on this adapter`)
}

function extractRemoteHost(bot: Bot): string {
  try {
    const ep = (bot.config as any)?.endpoint
    if (ep) {
      const parsed = new URL(ep)
      return parsed.hostname
    }
  } catch {}
  return '127.0.0.1'
}

export async function pushAnimeVideo(
  bot: Bot,
  options: PushOptions
): Promise<PushResult> {
  const {
    channelId,
    filePath,
    title,
    fileName = path.basename(filePath),
    magnetUrl,
    videoSizeThresholdMB = 80,
    uploadTimeoutMs = 10 * 60 * 1000,
    logger,
    serverHost,
    serverPort = 0,
  } = options

  if (!fs.existsSync(filePath)) {
    throw new Error(`Target file does not exist: ${filePath}`)
  }

  const stat = await fs.promises.stat(filePath)
  const sizeMB = stat.size / (1024 * 1024)
  const absolutePath = path.resolve(filePath)
  const fileUrl = pathToFileURL(absolutePath).href

  // Extract clean target group/channel id (e.g. 'onebot:123456' -> '123456')
  const cleanTargetId = channelId.includes(':')
    ? channelId.split(':')[1]
    : channelId
  const targetGid = Number(cleanTargetId) || cleanTargetId

  // Mode 1: <= Threshold -> Direct video message
  if (sizeMB <= videoSizeThresholdMB) {
    try {
      logger?.info?.(`[push] Sending video message to ${channelId} (${sizeMB.toFixed(1)}MB)`)
      await bot.sendMessage(channelId, [
        h.text(`【番剧更新】${title}\n`),
        h.video(fileUrl),
      ])
      return { success: true, mode: 'video' }
    } catch (err: any) {
      logger?.warn?.(`[push] Failed to send regular video message: ${err?.message}. Attempting group file upload fallback.`)
    }
  }

  // Mode 2: > Threshold or regular video failed -> OneBot upload_group_file
  const hasUploadGroupFile =
    typeof bot.internal?.uploadGroupFile === 'function' ||
    typeof bot.internal?.upload_group_file === 'function' ||
    Boolean((bot.adapter as any)?.socket)

  if (hasUploadGroupFile) {
    const remoteHost = extractRemoteHost(bot)
    const isRemote = !['127.0.0.1', 'localhost', '::1'].includes(remoteHost)

    logger?.info?.(
      `[push] Uploading group file to ${cleanTargetId} (${sizeMB.toFixed(1)}MB, remoteHost: ${remoteHost}, timeout: ${Math.round(uploadTimeoutMs / 1000)}s)`
    )

    // If local, attempt direct path first with extended timeout
    if (!isRemote) {
      try {
        await invokeOneBotAction(
          bot,
          'upload_group_file',
          { group_id: targetGid, file: absolutePath, name: fileName },
          uploadTimeoutMs,
          logger
        )
        await bot.sendMessage(
          channelId,
          `【番剧更新】${title}\n大小：${sizeMB.toFixed(1)}MB，已成功上传至群文件！`
        )
        return { success: true, mode: 'group_file' }
      } catch (localErr: any) {
        logger?.warn?.(`[push] Direct local file upload failed: ${localErr?.message}, trying streaming HTTP server...`)
      }
    }

    // Remote or local fallback: Stream file via temporary HTTP server
    let tempServer: { url: string; close: () => void } | null = null
    try {
      const localIp = serverHost || getLocalIpForRemote(remoteHost)
      tempServer = await createTemporaryFileServer(absolutePath, localIp, serverPort, logger)
      logger?.info?.(`[push] Serving video stream to OneBot adapter at: ${tempServer.url}`)

      await invokeOneBotAction(
        bot,
        'upload_group_file',
        { group_id: targetGid, file: tempServer.url, name: fileName },
        uploadTimeoutMs,
        logger
      )

      await bot.sendMessage(
        channelId,
        `【番剧更新】${title}\n大小：${sizeMB.toFixed(1)}MB，已成功上传至群文件！`
      )
      return { success: true, mode: 'group_file' }
    } catch (streamErr: any) {
      logger?.warn?.(`[push] upload_group_file failed: ${streamErr?.message}`)
    } finally {
      // Delay closing server slightly to allow final socket teardown
      setTimeout(() => {
        tempServer?.close()
      }, 5000)
    }
  }

  // Mode 3: Fallback -> notify group with magnet link
  try {
    const reason = !hasUploadGroupFile
      ? `当前适配器不支持直接上传群文件，视频大小（${sizeMB.toFixed(1)}MB）超出群聊直发限制（${videoSizeThresholdMB}MB）`
      : `视频过大且上传群文件失败`

    await bot.sendMessage(
      channelId,
      `【番剧更新提醒】${title}\n大小：${sizeMB.toFixed(1)}MB\n提示：${reason}\n${
        magnetUrl ? `磁力链接：\n${magnetUrl}` : '请查看 RSS 订阅源获取下载链接。'
      }`
    )
    return { success: true, mode: 'fallback_magnet' }
  } catch (err: any) {
    return { success: false, mode: 'fallback_magnet', error: err?.message }
  }
}
