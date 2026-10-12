import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import torrentStream from 'torrent-stream'
import { DownloadResult } from './types'

export const DEFAULT_TRACKERS = [
  'http://open.acgtracker.com:1096/announce',
  'udp://tracker4.itzmx.com:2710/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'http://nyaa.tracker.wf:7777/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://tracker.renfei.net:8080/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.mywaifu.best:6969/announce',
  'https://t.213891.xyz:443/announce',
  'https://tracker.foreverpirates.co:443/announce',
  'https://tracker.nanoha.org:443/announce',
  'udp://tracker.moeking.me:6969/announce',
]

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

  private async processNext() {
    if (this.isProcessing) return
    const item = this.queue.shift()
    if (!item) return

    this.isProcessing = true
    try {
      const result = await item.fn()
      item.resolve(result)
    } catch (err) {
      item.reject(err)
    } finally {
      this.isProcessing = false
      this.processNext()
    }
  }

  public get pendingCount(): number {
    return this.queue.length
  }

  public get active(): boolean {
    return this.isProcessing
  }
}

export async function downloadViaAria2(
  aria2Bin: string,
  source: { torrentUrl?: string; magnetUrl?: string; infoHash?: string },
  outputDir: string,
  timeoutMs = 30 * 60 * 1000,
  httpGetter?: (url: string) => Promise<ArrayBuffer>,
  stalledTimeoutMs = 120 * 1000,
  onProgress?: (progressStr: string) => void
): Promise<DownloadResult> {
  const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const taskDir = path.join(outputDir, taskId)
  await fs.promises.mkdir(taskDir, { recursive: true })

  let targetArg = ''
  let torrentFilePath = ''

  if (source.torrentUrl) {
    if (httpGetter) {
      try {
        const arrayBuf = await httpGetter(source.torrentUrl)
        torrentFilePath = path.join(taskDir, 'source.torrent')
        await fs.promises.writeFile(torrentFilePath, Buffer.from(arrayBuf))
        targetArg = torrentFilePath
      } catch {
        targetArg = source.torrentUrl
      }
    } else {
      targetArg = source.torrentUrl
    }
  } else if (source.magnetUrl) {
    targetArg = source.magnetUrl
  } else if (source.infoHash) {
    targetArg = `magnet:?xt=urn:btih:${source.infoHash}`
  } else {
    throw new Error('No valid torrent URL, magnet, or infoHash provided for aria2')
  }

  const trackerArg = DEFAULT_TRACKERS.join(',')

  const args = [
    '--seed-time=0',
    '--summary-interval=5',
    '--file-allocation=none',
    '--peer-id-prefix=-qB4630-',
    '--user-agent=qBittorrent/4.6.3',
    '--enable-peer-exchange=true',
    '--enable-dht=true',
    '--enable-dht6=false',
    '--dht-listen-port=6881-6999',
    '--listen-port=6881-6999',
    '--bt-enable-lpd=true',
    '--bt-max-peers=80',
    '--max-connection-per-server=16',
    '--split=16',
    '--min-split-size=1M',
    '--max-upload-limit=1M',
    '--bt-tracker-connect-timeout=5',
    '--bt-tracker-timeout=5',
    '--dht-entry-point=dht.transmissionbt.com:6881',
    '--dht-entry-point=router.bittorrent.com:6881',
    '--dht-entry-point=router.utorrent.com:6881',
    `--bt-tracker=${trackerArg}`,
    '--follow-torrent=mem',
    `--dir=${taskDir}`,
    targetArg,
  ]

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

            // Stalled detection: if 0 seeders and 0 speed for stalledTimeoutMs
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
              // Reset timer when there are seeders or speed > 0
              zeroSpeedStart = now
            }

            // Throttle progress log to at most once every 15 seconds
            if (now - lastLogTime >= 15000) {
              lastLogTime = now
              const prettyLog = `进度: ${percent} (${downloaded.trim()}/${total.trim()}) | 速度: ${dl.trim()} | 连接节点: ${cn} | 做种者: ${sd}`
              onProgress?.(prettyLog)
            }
          }
        }
      }
    })

    child.on('error', (err) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)
        reject(err)
      }
    })

    child.on('close', async (code) => {
      if (!finished) {
        finished = true
        clearTimeout(timer)

        if (code !== 0) {
          fs.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {})
          return reject(new Error(`Aria2 exited with error code ${code}`))
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
  httpGetter?: (url: string) => Promise<ArrayBuffer>
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
        connections: 50,
        uploads: 1,
        trackers: DEFAULT_TRACKERS,
      })

      engine.listen()

      engine.on('error', (err: any) => {
        if (!finished) {
          finished = true
          clearTimeout(timer)
          cleanup()
          reject(err)
        }
      })

      engine.on('ready', () => {
        if (finished) return

        const files = engine.files || []
        if (files.length === 0) {
          finished = true
          clearTimeout(timer)
          cleanup()
          return reject(new Error('Torrent contains no files'))
        }

        const videoFiles = files.filter((f: any) => isVideoFile(f.name))
        const candidates = videoFiles.length > 0 ? videoFiles : files
        candidates.sort((a: any, b: any) => (b.length || 0) - (a.length || 0))
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
  onProgress?: (progressStr: string) => void
): Promise<DownloadResult> {
  const aria2Bin = resolveAria2Binary(customAria2Path)

  if (forceEngine === 'torrent-stream' || !aria2Bin) {
    return downloadViaTorrentStream(source, outputDir, timeoutMs, httpGetter)
  }

  // Use Aria2 as default high-performance engine
  return downloadViaAria2(
    aria2Bin,
    source,
    outputDir,
    timeoutMs,
    httpGetter,
    stalledTimeoutMs,
    onProgress
  )
}
