import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import torrentStream from 'torrent-stream'
import { DownloadResult } from './types'
import {
  TrackerManager,
  DEFAULT_FALLBACK_TRACKERS,
  DHT_BOOTSTRAP_NODES,
} from './tracker'

export const DEFAULT_TRACKERS = DEFAULT_FALLBACK_TRACKERS

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.ts', '.flv', '.webm', '.mov']

export function isVideoFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return VIDEO_EXTENSIONS.includes(ext)
}

function findVideoFileRecursive(dir: string): { filePath: string; fileName: string; size: number } | null {
  if (!fs.existsSync(dir)) return null
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let candidate: { filePath: string; fileName: string; size: number } | null = null

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = findVideoFileRecursive(fullPath)
      if (sub && (!candidate || sub.size > candidate.size)) {
        candidate = sub
      }
    } else if (entry.isFile()) {
      if (isVideoFile(entry.name) && !entry.name.endsWith('.aria2')) {
        const stat = fs.statSync(fullPath)
        if (!candidate || stat.size > candidate.size) {
          candidate = { filePath: fullPath, fileName: entry.name, size: stat.size }
        }
      }
    }
  }

  return candidate
}

export function resolveAria2Binary(customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }

  const bundledExe = path.resolve(__dirname, '../bin/aria2c.exe')
  if (fs.existsSync(bundledExe)) {
    return bundledExe
  }

  const bundledBin = path.resolve(__dirname, '../bin/aria2c')
  if (fs.existsSync(bundledBin)) {
    return bundledBin
  }

  try {
    const { execSync } = require('child_process')
    const cmd = process.platform === 'win32' ? 'where.exe aria2c' : 'which aria2c'
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const firstLine = out.split(/\r?\n/)[0]?.trim()
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine
    }
  } catch {
    // not in system PATH
  }

  return null
}

interface QueueItem<T> {
  fn: () => Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: any) => void
}

export class DownloaderQueue {
  private queue: QueueItem<any>[] = []
  private isProcessing = false

  public runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processNext()
    })
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true
    const current = this.queue.shift()!

    try {
      const result = await current.fn()
      current.resolve(result)
    } catch (err) {
      current.reject(err)
    } finally {
      this.isProcessing = false
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext())
      }
    }
  }

  public get pending(): number {
    return this.queue.length
  }

  public get busy(): boolean {
    return this.isProcessing
  }
}

export interface DownloadOptions {
  timeoutMs?: number
  httpGetter?: (url: string) => Promise<ArrayBuffer>
  stalledTimeoutMs?: number
  onProgress?: (progressStr: string) => void
  trackerManager?: TrackerManager
  customTrackers?: string[]
}

export async function downloadViaAria2(
  aria2Bin: string,
  source: { torrentUrl?: string; magnetUrl?: string; infoHash?: string },
  outputDir: string,
  timeoutMs = 30 * 60 * 1000,
  httpGetter?: (url: string) => Promise<ArrayBuffer>,
  stalledTimeoutMs = 120 * 1000,
  onProgress?: (progressStr: string) => void,
  trackerManager?: TrackerManager,
  customTrackers: string[] = [],
  listenPort = '51413-51425'
): Promise<DownloadResult> {
  const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const taskDir = path.join(outputDir, taskId)
  await fs.promises.mkdir(taskDir, { recursive: true })

  let targetArg = ''
  let torrentFilePath = ''

  // 1. 尝试优先获取种子文件（带完整容错与备用降级）
  if (source.torrentUrl) {
    if (httpGetter) {
      try {
        const arrayBuf = await httpGetter(source.torrentUrl)
        if (arrayBuf && arrayBuf.byteLength > 50) {
          const firstByte = new Uint8Array(arrayBuf)[0]
          // 必须以 ASCII 字符 'd' (0x64) 开头才为合法的 Bencode 字典，防止将 403/Cloudflare 等 HTML 误存为种子
          if (firstByte === 0x64) {
            torrentFilePath = path.join(taskDir, 'source.torrent')
            await fs.promises.writeFile(torrentFilePath, Buffer.from(arrayBuf))
            targetArg = torrentFilePath
          }
        }
      } catch {
        // httpGetter 失败（如大陆环境无法直接连通外网种子服务器）
      }
    }
  }

  // 2. 若种子文件下载失败，绝不能直接把不可达的 HTTP URL 传给 aria2（会导致死锁）
  // 必须平滑降级为注入了全网最佳 Trackers 的磁力链接
  if (!targetArg) {
    const rawMagnet =
      source.magnetUrl ||
      (source.infoHash ? `magnet:?xt=urn:btih:${source.infoHash}` : '')

    if (rawMagnet) {
      targetArg = trackerManager
        ? trackerManager.injectTrackersIntoMagnet(rawMagnet)
        : rawMagnet
    } else if (source.torrentUrl) {
      // 没有任何磁力信息时才回退至原始 torrentUrl
      targetArg = source.torrentUrl
    } else {
      throw new Error('No valid torrent URL, magnet, or infoHash provided for aria2')
    }
  }

  // 3. 组装高可用 Tracker 列表（合并动态同步源 + 内置精选源 + 用户自定义源）
  const activeTrackers = trackerManager
    ? trackerManager.getTrackers(customTrackers)
    : DEFAULT_FALLBACK_TRACKERS.concat(customTrackers)
  const trackerArg = activeTrackers.join(',')

  // 4. 组装 DHT 与 P2P 参数（参考 Motrix Next、qBittorrent 与 P3TERX 最佳实践）
  const args = [
    '--seed-time=0',
    '--summary-interval=5',
    '--file-allocation=none',
    '--check-certificate=false', // 允许连接无系统根证书或自签名的 HTTPS Trackers，避免 Windows 环境 TLS 握手失败
    '--bt-force-encryption=true', // 强制混淆握手与加密传输（防国内运营商 DPI 深度包检测阻断，同时兼容强制加密的海外做种者）
    `--listen-port=${listenPort}`, // 规避国内运营商对 6881-6999 BT 默认端口的阻断与 QoS 限速
    `--dht-listen-port=${listenPort}`,
    '--peer-id-prefix=-qB4630-',
    '--peer-agent=qBittorrent/4.6.3', // 伪装 BEP 10 扩展握手 Client Agent，避免被海外做种者或防吸血策略 Choke
    '--user-agent=qBittorrent/4.6.3',
    '--enable-peer-exchange=true',
    '--enable-dht=true',
    '--enable-dht6=false', // 国内多数环境未开通 IPv6 或 IPv6 UDP 黑洞，优先专注 IPv4 DHT 避免超时挂起
    '--bt-enable-lpd=true', // 开启本地对等发现（Local Peer Discovery）
    '--bt-max-peers=128',
    '--bt-request-peer-speed-limit=10M', // 低速时积极扩大并发向所有已连接 Peer/Seed 索取分片，大幅改善初始连接做种者速度
    '--max-connection-per-server=16',
    '--split=16',
    '--min-split-size=1M',
    '--max-upload-limit=2M',
    // 增加连接握手超时，适应国内跨境网络高丢包高延迟环境
    '--bt-tracker-connect-timeout=10',
    '--bt-tracker-timeout=10',
    '--bt-tracker-interval=120', // 每 120 秒重新向所有 Tracker 汇报以快速捕获新入网做种者
    '--bt-save-metadata=true',
    '--bt-load-saved-metadata=true',
    '--bt-prioritize-piece=head,tail',
  ]

  // 配置 DHT 路由表持久化，避免每次重启从 0 节点冷启动
  if (trackerManager) {
    args.push(`--dht-file-path=${trackerManager.getDhtFilePath()}`)
    args.push(`--dht-file-path6=${trackerManager.getDht6FilePath()}`)
  }

  // 注入全网公认可靠的高可用 DHT 引导节点
  for (const node of DHT_BOOTSTRAP_NODES) {
    args.push(`--dht-entry-point=${node}`)
  }

  // 注入 Tracker 参数与任务目录
  args.push(`--bt-tracker=${trackerArg}`)
  args.push('--follow-torrent=mem')
  args.push(`--dir=${taskDir}`)
  args.push(targetArg)

  return new Promise<DownloadResult>((resolve, reject) => {
    let finished = false
    const child = spawn(aria2Bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let lastLogTime = 0
    let zeroSpeedStart = Date.now()

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        child.kill()
        fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
        reject(new Error(`Aria2 download timed out after ${Math.round(timeoutMs / 1000)}s`))
      }
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const lines = text.split(/\r?\n/)
      for (const line of lines) {
        if (line.includes('[#') && line.includes('%')) {
          const now = Date.now()
          const match = line.match(/\[#\w+\s+([^\/]+)\/([^\(]+)\(([^\)]+)\)\s+CN:(\d+)\s+SD:(\d+)\s+DL:([^\]]+)\]/)

          if (match) {
            const [, downloaded, total, percent, cn, sd, dl] = match
            const seeders = parseInt(sd, 10)
            const speedIsZero = dl.trim().startsWith('0B')

            // 死种熔断检测：若在设定时限内持续无做种者且速度为 0，跳出避免卡死队列
            if (seeders === 0 && speedIsZero) {
              if (now - zeroSpeedStart >= stalledTimeoutMs) {
                if (!finished) {
                  finished = true
                  clearTimeout(timer)
                  child.kill()
                  fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
                  return reject(new Error(`当前资源暂无活跃做种者(SD:0)，已在搜寻 ${Math.round(stalledTimeoutMs / 1000)} 秒后自动跳过下载`))
                }
              }
            } else {
              // 检测到有做种者或有下载流量时，重置死种计时器
              zeroSpeedStart = now
            }

            // 进度日志节流（每 15 秒最多输出一次，保持控制台整洁）
            if (now - lastLogTime >= 15000) {
              lastLogTime = now
              const prettyLog = `进度: ${percent} (${downloaded.trim()}/${total.trim()}) | 速度: ${dl.trim()} | 连接节点: ${cn} | 做种者: ${sd}`
              onProgress?.(prettyLog)
            }
          }
        }
      }
    })

    child.stderr.on('data', () => {
      // aria2 stderr 抑制
    })

    child.on('error', (err) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)
        fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
        reject(err)
      }
    })

    child.on('close', (code) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)

        if (code !== 0) {
          fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
          return reject(new Error(`Aria2 exited with non-zero exit code: ${code}`))
        }

        const video = findVideoFileRecursive(taskDir)
        if (!video) {
          fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
          return reject(new Error('Aria2 download completed but no video file was found'))
        }

        resolve({
          filePath: video.filePath,
          fileName: video.fileName,
          fileSize: video.size,
          infoHash: source.infoHash || '',
        })
      }
    })
  })
}

export async function downloadViaTorrentStream(
  source: { torrentUrl?: string; magnetUrl?: string; infoHash?: string },
  outputDir: string,
  timeoutMs = 30 * 60 * 1000,
  httpGetter?: (url: string) => Promise<ArrayBuffer>,
  trackerManager?: TrackerManager,
  customTrackers: string[] = []
): Promise<DownloadResult> {
  await fs.promises.mkdir(outputDir, { recursive: true })

  let torrentTarget: string | Buffer
  if (source.torrentUrl && httpGetter) {
    try {
      const arrayBuf = await httpGetter(source.torrentUrl)
      torrentTarget = Buffer.from(arrayBuf)
    } catch {
      if (source.magnetUrl) {
        torrentTarget = source.magnetUrl
      } else {
        throw new Error(`Failed to fetch torrent file from ${source.torrentUrl}`)
      }
    }
  } else if (source.magnetUrl) {
    torrentTarget = source.magnetUrl
  } else if (source.infoHash) {
    torrentTarget = `magnet:?xt=urn:btih:${source.infoHash}`
  } else {
    throw new Error('No valid torrent URL, magnet, or infoHash provided for download')
  }

  const trackers = trackerManager
    ? trackerManager.getTrackers(customTrackers)
    : DEFAULT_FALLBACK_TRACKERS.concat(customTrackers)

  return new Promise<DownloadResult>((resolve, reject) => {
    let finished = false
    let engine: any = null
    let writeStream: fs.WriteStream | null = null
    let targetFilePath = ''

    const cleanup = () => {
      if (engine) {
        try {
          engine.destroy()
        } catch {
          // ignore
        }
        engine = null
      }
    }

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        if (writeStream) {
          writeStream.destroy()
        }
        cleanup()
        if (targetFilePath && fs.existsSync(targetFilePath)) {
          fs.promises.unlink(targetFilePath).catch(() => {})
        }
        reject(new Error(`Download timed out after ${Math.round(timeoutMs / 1000)}s`))
      }
    }, timeoutMs)

    try {
      engine = torrentStream(torrentTarget, {
        path: outputDir,
        connections: 80,
        trackers,
      })

      engine.on('error', (err: any) => {
        if (!finished) {
          finished = true
          clearTimeout(timer)
          cleanup()
          reject(err)
        }
      })

      engine.on('ready', () => {
        const files: any[] = engine.files || []
        const candidates = files.filter((f) => isVideoFile(f.name))

        if (candidates.length === 0) {
          if (!finished) {
            finished = true
            clearTimeout(timer)
            cleanup()
            reject(new Error('No video file found in torrent content'))
          }
          return
        }

        candidates.sort((a, b) => b.length - a.length)
        const chosenFile = candidates[0]

        for (const f of files) {
          if (f !== chosenFile && typeof f.deselect === 'function') {
            f.deselect()
          }
        }

        if (typeof chosenFile.select === 'function') {
          chosenFile.select()
        }

        const safeFileName = chosenFile.name.replace(/[\\/:*?"<>|]/g, '_')
        targetFilePath = path.join(outputDir, `${Date.now()}_${safeFileName}`)
        writeStream = fs.createWriteStream(targetFilePath)

        const readStream = chosenFile.createReadStream()

        readStream.on('error', (err: any) => {
          if (!finished) {
            finished = true
            clearTimeout(timer)
            writeStream?.destroy()
            cleanup()
            if (fs.existsSync(targetFilePath)) {
              fs.promises.unlink(targetFilePath).catch(() => {})
            }
            reject(err)
          }
        })

        writeStream.on('error', (err: any) => {
          if (!finished) {
            finished = true
            clearTimeout(timer)
            cleanup()
            if (fs.existsSync(targetFilePath)) {
              fs.promises.unlink(targetFilePath).catch(() => {})
            }
            reject(err)
          }
        })

        writeStream.on('finish', async () => {
          if (!finished) {
            finished = true
            clearTimeout(timer)
            cleanup()

            try {
              const stat = await fs.promises.stat(targetFilePath)
              resolve({
                filePath: targetFilePath,
                fileName: chosenFile.name,
                fileSize: stat.size,
                infoHash: engine?.infoHash || source.infoHash || '',
              })
            } catch (err) {
              reject(err)
            }
          }
        })

        readStream.pipe(writeStream)
      })
    } catch (err) {
      if (!finished) {
        finished = true
        clearTimeout(timer)
        cleanup()
        reject(err)
      }
    }
  })
}

export async function downloadTorrentItem(
  source: { torrentUrl?: string; magnetUrl?: string; infoHash?: string },
  outputDir: string,
  timeoutMs = 30 * 60 * 1000,
  httpGetter?: (url: string) => Promise<ArrayBuffer>,
  customAria2Path?: string,
  forceEngine?: 'builtin-aria2' | 'torrent-stream',
  stalledTimeoutMs = 120 * 1000,
  onProgress?: (progressStr: string) => void,
  trackerManager?: TrackerManager,
  customTrackers: string[] = [],
  listenPort = '51413-51425'
): Promise<DownloadResult> {
  const aria2Bin = resolveAria2Binary(customAria2Path)

  if (forceEngine === 'torrent-stream' || !aria2Bin) {
    return downloadViaTorrentStream(
      source,
      outputDir,
      timeoutMs,
      httpGetter,
      trackerManager,
      customTrackers
    )
  }

  // 默认使用原生高性能 Aria2 引擎
  return downloadViaAria2(
    aria2Bin,
    source,
    outputDir,
    timeoutMs,
    httpGetter,
    stalledTimeoutMs,
    onProgress,
    trackerManager,
    customTrackers,
    listenPort
  )
}
