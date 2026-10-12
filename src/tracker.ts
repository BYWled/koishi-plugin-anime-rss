import fs from 'fs'
import path from 'path'
import { Context, Logger } from 'koishi'

/**
 * 经过精选与验证的高可用内置静态备用 Tracker 列表
 * 涵盖国内外顶尖动漫及通用 Tracker（HTTP/HTTPS/UDP 多协议混合，保障穿透性）
 */
export const DEFAULT_FALLBACK_TRACKERS: string[] = [
  // 核心动漫与二次元专用 Tracker
  'http://open.acgtracker.com:1096/announce',
  'http://nyaa.tracker.wf:7777/announce',
  'http://t.acg.rip:6699/announce',
  'http://share.camoe.cn:8080/announce',
  'udp://tracker4.itzmx.com:2710/announce',
  'http://tracker4.itzmx.com:2710/announce',
  'https://tracker.nanoha.org:443/announce',
  'https://tracker.lilithraws.org:443/announce',
  'udp://tracker.mywaifu.best:6969/announce',
  'https://tr.ready4.icu:443/announce',

  // 高穿透性 HTTP/HTTPS Tracker（免疫国内运营商 UDP QoS 拦截）
  'https://t.213891.xyz:443/announce',
  'https://tracker.foreverpirates.co:443/announce',
  'http://1337.abcvg.info:80/announce',
  'http://bt1.archive.org:6969/announce',
  'http://bt2.archive.org:6969/announce',
  'http://tracker.dler.org:6969/announce',
  'http://tracker.renfei.net:8080/announce',
  'https://tracker.tamersunion.org:443/announce',
  'https://tr.burnabyhighstar.com:443/announce',
  'http://tracker.ipv6tracker.ru:80/announce',

  // 全网顶级高活跃 UDP Tracker
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://explodie.org:6969/announce',
  'udp://retracker.lanta-net.ru:2710/announce',
  'udp://tracker.altrosky.nl:6969/announce',
  'udp://tracker.filemail.com:6969/announce',
  'udp://tracker0.ufibox.com:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'udp://tracker.srv00.com:6969/announce',
  'udp://wepawet.cz:6969/announce',
  'udp://vibe.rip:6969/announce',
  'udp://valakas.online:6969/announce',
  'udp://tc.animereactor.ru:8082/announce',
  'udp://new-line.net:6969/announce',
]

/**
 * 专为中国大陆网络环境优化的优质 Tracker 在线镜像订阅源（多重 CDN 容灾）
 */
export const TRACKER_MIRROR_SOURCES = [
  'https://cf.trackerslist.com/best_aria2.txt',
  'https://trackerslist.com/best_aria2.txt',
  'https://cf.trackerslist.com/http_aria2.txt',
  'https://fastly.jsdelivr.net/gh/XIU2/TrackersListCollection@master/best_aria2.txt',
  'https://ngosang.github.io/trackerslist/trackers_best.txt',
]

/**
 * 高可用 DHT 引导节点（Bootstrap Nodes）
 */
export const DHT_BOOTSTRAP_NODES = [
  'dht.transmissionbt.com:6881',
  'dht.libtorrent.org:25401',
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.aelitis.com:6881',
]

export class TrackerManager {
  private inMemoryTrackers: Set<string> = new Set(DEFAULT_FALLBACK_TRACKERS)
  private cacheFilePath: string
  private dhtFilePath: string
  private dht6FilePath: string
  private logger = new Logger('[anime-rss]')
  private lastSyncTime = 0

  constructor(baseDir: string) {
    const dataDir = path.resolve(baseDir, 'data/anime-rss')
    fs.mkdirSync(dataDir, { recursive: true })
    this.cacheFilePath = path.join(dataDir, 'trackers.txt')
    this.dhtFilePath = path.join(dataDir, 'dht.dat')
    this.dht6FilePath = path.join(dataDir, 'dht6.dat')

    this.loadFromCache()
  }

  public getDhtFilePath(): string {
    return this.dhtFilePath
  }

  public getDht6FilePath(): string {
    return this.dht6FilePath
  }

  /**
   * 从本地缓存加载 Tracker
   */
  private loadFromCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const content = fs.readFileSync(this.cacheFilePath, 'utf8')
        const items = this.parseTrackerString(content)
        if (items.length > 0) {
          items.forEach((t) => this.inMemoryTrackers.add(t))
          const stat = fs.statSync(this.cacheFilePath)
          this.lastSyncTime = stat.mtimeMs
        }
      }
    } catch {
      // 容错处理
    }
  }

  /**
   * 解析 Tracker 文本（兼容逗号分割与换行分割）
   */
  public parseTrackerString(content: string): string[] {
    return content
      .split(/[,\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => {
        return (
          s.startsWith('http://') ||
          s.startsWith('https://') ||
          s.startsWith('udp://') ||
          s.startsWith('wss://')
        )
      })
  }

  /**
   * 同步在线优质 Tracker 列表（支持 Koishi ctx.http 代理穿透）
   */
  public async syncTrackers(ctx?: Context, force = false): Promise<number> {
    const now = Date.now()
    // 默认 12 小时内不重复全网探测，除非强制更新
    if (!force && this.lastSyncTime > 0 && now - this.lastSyncTime < 12 * 3600 * 1000) {
      return this.inMemoryTrackers.size
    }

    const fetchedSet = new Set<string>()

    for (const url of TRACKER_MIRROR_SOURCES) {
      try {
        let text = ''
        if (ctx?.http) {
          text = await ctx.http.get<string>(url, {
            responseType: 'text',
            timeout: 6000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; anime-rss/1.0.0; +https://github.com/BYWled/koishi-plugin-anime-rss)',
            },
          })
        } else {
          const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
          if (res.ok) {
            text = await res.text()
          }
        }

        if (text) {
          const trackers = this.parseTrackerString(text)
          for (const t of trackers) {
            fetchedSet.add(t)
          }
        }
      } catch {
        // 单个源超时或被阻断，自动尝试下一个镜像源
      }
    }

    if (fetchedSet.size > 0) {
      // 合并入内存
      fetchedSet.forEach((t) => this.inMemoryTrackers.add(t))
      this.lastSyncTime = now

      // 写入持久化缓存
      try {
        const content = Array.from(this.inMemoryTrackers).join('\n')
        fs.writeFileSync(this.cacheFilePath, content, 'utf8')
        this.logger.info(`[tracker] 成功同步 ${fetchedSet.size} 个在线活跃 Tracker，当前池中可用 Tracker 总数: ${this.inMemoryTrackers.size}`)
      } catch (err: any) {
        this.logger.warn(`[tracker] 写入缓存文件失败: ${err.message}`)
      }
    } else {
      this.logger.info(`[tracker] 暂未获取到新在线源，继续使用当前缓存与内置 Tracker (${this.inMemoryTrackers.size} 个)`)
    }

    return this.inMemoryTrackers.size
  }

  /**
   * 获取合并后的完整可用 Tracker 列表（支持用户自定义追加）
   */
  public getTrackers(customTrackers: string[] = []): string[] {
    const combined = new Set(this.inMemoryTrackers)
    for (const t of customTrackers) {
      const trimmed = t.trim()
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('udp://') ||
        trimmed.startsWith('wss://')
      ) {
        combined.add(trimmed)
      }
    }
    return Array.from(combined)
  }

  /**
   * 将高可用 Tracker 列表直接注入到 Magnet 链接中，形成自洽磁力链接
   * 大幅加速初始做种探测与 DHT 元数据下载
   */
  public injectTrackersIntoMagnet(magnetUrl: string, maxTrackers = 50): string {
    if (!magnetUrl.startsWith('magnet:?')) return magnetUrl

    const trackers = this.getTrackers()
    const selected = trackers.slice(0, maxTrackers)
    const trParams = selected.map((t) => `tr=${encodeURIComponent(t)}`).join('&')

    return magnetUrl.includes('?') ? `${magnetUrl}&${trParams}` : `${magnetUrl}?${trParams}`
  }
}
