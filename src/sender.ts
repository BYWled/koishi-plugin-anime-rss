import fs from 'fs'
import path from 'path'
import http from 'http'
import os from 'os'
import crypto from 'crypto'
import dgram from 'dgram'
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
 * Asynchronously determines the exact local IP routed by the OS kernel to the remote host.
 */
export async function getLocalIpForRemoteAsync(remoteHost: string): Promise<string> {
  if (['127.0.0.1', 'localhost', '::1'].includes(remoteHost)) {
    return '127.0.0.1'
  }

  // 1. Ask OS kernel routing table via UDP socket
  const kernelIp = await new Promise<string | null>((resolve) => {
    try {
      const socket = dgram.createSocket('udp4')
      socket.connect(80, remoteHost, () => {
        try {
          const addr = socket.address().address
          socket.close()
          resolve(addr && addr !== '0.0.0.0' ? addr : null)
        } catch {
          resolve(null)
        }
      })
      socket.on('error', () => {
        try {
          socket.close()
        } catch {}
        resolve(null)
      })
    } catch {
      resolve(null)
    }
  })

  if (kernelIp) return kernelIp

  // 2. Fallback to subnet and interface inspection
  return getLocalIpForRemote(remoteHost)
}

/**
 * Normalizes host strings by stripping protocol schemes (e.g. http://, https://), paths, and trailing slashes.
 * Also extracts port if the user provided host:port.
 */
export function parseHostAndPort(rawHost?: string, rawPort = 0): { host: string; port: number } {
  if (!rawHost) return { host: '', port: rawPort }
  let cleaned = rawHost.trim()
  while (/^[a-zA-Z]+:\/\//.test(cleaned)) {
    cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, '')
  }
  cleaned = cleaned.split('/')[0].trim()

  let port = rawPort
  if (cleaned.includes(':') && !cleaned.startsWith('[')) {
    const parts = cleaned.split(':')
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      cleaned = parts[0]
      if (port === 0) {
        port = Number(parts[1])
      }
    }
  }
  return { host: cleaned, port }
}

export function sanitizeHost(host: string): string {
  return parseHostAndPort(host).host
}

/**
 * Spawns a lightweight, token-protected temporary HTTP file streaming server.
 * Streams directly from disk with zero memory buffering. Supports HEAD and Range requests.
 */
export async function createTemporaryFileServer(
  filePath: string,
  preferredHost = '127.0.0.1',
  preferredPort = 0,
  logger?: Logger
): Promise<{ url: string; close: (force?: boolean) => void; isTransferring: () => boolean }> {
  const parsed = parseHostAndPort(preferredHost, preferredPort)
  const cleanHost = parsed.host || '127.0.0.1'
  const targetPort = parsed.port

  const token = crypto.randomBytes(8).toString('hex')
  const baseName = path.basename(filePath)
  const encodedName = encodeURIComponent(baseName)
  const stat = await fs.promises.stat(filePath)
  const fileSize = stat.size
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1)

  let activeTransfers = 0
  let isClosed = false

  const server = http.createServer((req, res) => {
    const reqUrl = req.url || ''
    if (!reqUrl.includes(token)) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }

    // Support HEAD method (many downloaders probe size first)
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize,
        'Content-Disposition': `attachment; filename="${encodedName}"`,
        'Accept-Ranges': 'bytes',
      })
      res.end()
      return
    }

    // Support Range requests (206 Partial Content)
    const range = req.headers.range
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

      if (isNaN(start) || isNaN(end) || start > end || start >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
        res.end()
        return
      }

      const chunkSize = end - start + 1
      activeTransfers++
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodedName}"`,
      })

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)

      const cleanup = () => {
        activeTransfers = Math.max(0, activeTransfers - 1)
      }
      res.on('finish', cleanup)
      res.on('close', () => {
        stream.destroy()
        cleanup()
      })
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(500)
        res.end()
        cleanup()
      })
      return
    }

    // Standard 200 GET
    activeTransfers++
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileSize,
      'Content-Disposition': `attachment; filename="${encodedName}"`,
      'Accept-Ranges': 'bytes',
    })

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)

    const cleanup = () => {
      activeTransfers = Math.max(0, activeTransfers - 1)
    }
    res.on('finish', () => {
      logger?.info?.(
        `[push] Video stream fully transferred to OneBot adapter (${fileSizeMB}MB). Waiting for adapter to finish uploading to QQ group...`
      )
      cleanup()
    })
    res.on('close', () => {
      stream.destroy()
      cleanup()
    })
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
      cleanup()
    })
  })

  // Set generous timeout to prevent connection drop during large file transfers
  server.setTimeout(30 * 60 * 1000)

  await new Promise<void>((resolve, reject) => {
    server.listen(targetPort, '0.0.0.0', () => resolve())
    server.on('error', reject)
  })

  const addr = server.address() as any
  const port = addr.port
  const url = `http://${cleanHost}:${port}/${token}/${encodedName}`

  return {
    url,
    isTransferring: () => activeTransfers > 0,
    close: (force = false) => {
      if (isClosed) return
      if (!force && activeTransfers > 0) {
        // Wait until ongoing transfer finishes before closing
        const checkInterval = setInterval(() => {
          if (activeTransfers <= 0) {
            clearInterval(checkInterval)
            if (!isClosed) {
              isClosed = true
              try {
                server.close()
              } catch {}
            }
          }
        }, 1000)
        setTimeout(() => {
          clearInterval(checkInterval)
          if (!isClosed) {
            isClosed = true
            try {
              server.close()
            } catch {}
          }
        }, 60000)
      } else {
        isClosed = true
        try {
          server.close()
        } catch {}
      }
    },
  }
}

/**
 * Resolves the underlying WebSocket socket object from Bot or Bot.adapter across all protocol modes (ws, ws-reverse).
 */
export function getBotSocket(bot: Bot): any {
  if ((bot.adapter as any)?.socket) return (bot.adapter as any).socket
  if ((bot as any)?.socket) return (bot as any).socket

  // Check symbol properties on bot (e.g. kSocket in ws-reverse)
  for (const sym of Object.getOwnPropertySymbols(bot)) {
    const val = (bot as any)[sym]
    if (val && typeof val.send === 'function') {
      return val
    }
  }

  // Check symbol properties on bot.adapter
  if (bot.adapter) {
    for (const sym of Object.getOwnPropertySymbols(bot.adapter)) {
      const val = (bot.adapter as any)[sym]
      if (val && typeof val.send === 'function') {
        return val
      }
    }
  }

  return null
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
  const socket = getBotSocket(bot)

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
            // retcode: 0 is sync success; retcode: 1 / status: 'async' is asynchronous task accepted in OneBot standard
            if (
              parsed.retcode === 0 ||
              parsed.retcode === 1 ||
              parsed.status === 'ok' ||
              parsed.status === 'async'
            ) {
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

export function extractRemoteHost(bot: Bot, socket?: any): string {
  try {
    const ep = (bot.config as any)?.endpoint
    if (ep) {
      const parsed = new URL(ep)
      if (parsed.hostname) return parsed.hostname
    }
  } catch {}

  // Check socket remoteAddress if available (e.g. reverse WebSocket)
  try {
    const sock = socket || getBotSocket(bot)
    const remote = sock?._socket?.remoteAddress || sock?.remoteAddress
    if (remote) {
      const clean = remote.replace(/^::ffff:/, '')
      if (clean) return clean
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
    return {
      success: false,
      mode: 'video',
      error: `Target file does not exist: ${filePath}`,
    }
  }

  const stat = await fs.promises.stat(filePath)
  const sizeMB = stat.size / (1024 * 1024)
  const absolutePath = path.resolve(filePath)
  const fileUrl = pathToFileURL(absolutePath).href

  // Clean target group/channel id (e.g. 'onebot:123456' -> '123456')
  const cleanTargetId = channelId.includes(':')
    ? channelId.split(':')[1]
    : channelId
  const targetGid = /^\d+$/.test(cleanTargetId) ? Number(cleanTargetId) : cleanTargetId

  // Sanitize file name for QQ group files (prohibit \ / : * ? " < > |)
  const cleanFileName = fileName.replace(/[\\/:*?"<>|]/g, '_')

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
      logger?.warn?.(
        `[push] Failed to send regular video message: ${err?.message}. Attempting group file upload fallback.`
      )
    }
  }

  // Mode 2: > Threshold or regular video failed -> OneBot upload_group_file
  const socket = getBotSocket(bot)
  const hasUploadGroupFile =
    typeof bot.internal?.uploadGroupFile === 'function' ||
    typeof bot.internal?.upload_group_file === 'function' ||
    Boolean(socket)

  if (hasUploadGroupFile) {
    const remoteHost = extractRemoteHost(bot, socket)
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
          { group_id: targetGid, file: absolutePath, name: cleanFileName },
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
    let tempServer: { url: string; close: (force?: boolean) => void } | null = null
    try {
      const parsedConfig = parseHostAndPort(serverHost, serverPort)
      let localIp = parsedConfig.host

      // Guard: If user accidentally configured serverHost as the remote bot's IP
      if (localIp && isRemote && localIp === remoteHost) {
        logger?.warn?.(
          `[push] 配置的 serverHost (${localIp}) 与协议端 remoteHost 相同！serverHost 必须是运行 Koishi 的机器 IP，已自动切换为内核路由探测 IP。`
        )
        localIp = await getLocalIpForRemoteAsync(remoteHost)
      } else if (!localIp) {
        localIp = await getLocalIpForRemoteAsync(remoteHost)
      }

      const effectivePort = parsedConfig.port
      tempServer = await createTemporaryFileServer(absolutePath, localIp, effectivePort, logger)
      logger?.info?.(`[push] Serving video stream to OneBot adapter at: ${tempServer.url}`)

      await invokeOneBotAction(
        bot,
        'upload_group_file',
        { group_id: targetGid, file: tempServer.url, name: cleanFileName },
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
      return {
        success: false,
        mode: 'group_file',
        error: `upload_group_file failed: ${streamErr?.message}`,
      }
    } finally {
      // Delay closing server slightly to allow ongoing socket streaming to complete
      setTimeout(() => {
        tempServer?.close(false)
      }, 10000)
    }
  }

  // Mode 3: Fallback -> notify group with magnet link (only for adapters lacking group file upload capability)
  try {
    const reason = `当前平台适配器不支持直接上传群文件，视频大小（${sizeMB.toFixed(1)}MB）超出群聊直发限制（${videoSizeThresholdMB}MB）`

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
