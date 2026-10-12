import fs from 'fs'
import path from 'path'
import { Context, Schema, Logger, Bot } from 'koishi'
import { SubscriptionItem } from './types'
import {
  initDatabase,
  getDatabaseSubscriptions,
  isItemPushed,
  recordPushedItem,
} from './database'
import { fetchAndParseRss } from './rss'
import { DownloaderQueue, downloadTorrentItem } from './downloader'
import { pushAnimeVideo } from './sender'
import { registerCommands } from './commands'

export const name = 'anime-rss'

export const inject = {
  required: ['database'],
  optional: ['server-temp'],
}

export interface Config {
  downloader: 'builtin-aria2' | 'torrent-stream'
  aria2CustomPath?: string
  stalledTimeout: number
  checkInterval: number
  downloadTimeout: number
  videoSizeThreshold: number
  storagePath: string
  autoClean: boolean
  cleanDelay: number
  uploadTimeout: number
  serverHost?: string
  serverPort?: number
  subscriptions: SubscriptionItem[]
}

export const Config: Schema<Config> = Schema.object({
  downloader: Schema.union(['builtin-aria2', 'torrent-stream'])
    .default('builtin-aria2')
    .description('种子下载引擎：builtin-aria2（内置高速 Aria2 原生引擎，推荐）/ torrent-stream（Node.js 引擎）'),
  aria2CustomPath: Schema.string()
    .description('自定义 aria2 可执行文件路径（留空则自动使用插件内置的 bin/aria2c 或系统 PATH 中的 aria2c）'),
  stalledTimeout: Schema.number()
    .default(120)
    .description('无做种者(死种)熔断时限（秒）。若在此时间内全网做种数(SD)持续为 0 且无流量，自动跳过并推送备用磁力链接，避免卡死下载队列'),
  checkInterval: Schema.number()
    .default(15)
    .description('RSS 轮询间隔（分钟）'),
  downloadTimeout: Schema.number()
    .default(30)
    .description('单集种子下载超时时间（分钟）'),
  uploadTimeout: Schema.number()
    .default(10)
    .description('群文件上传超时时限（分钟），解决大文件上传耗时较长被协议端默认 60 秒熔断的问题'),
  videoSizeThreshold: Schema.number()
    .default(80)
    .description('普通群视频直发上限（MB），超出自动转为上传群文件'),
  storagePath: Schema.string()
    .default('data/anime-rss/temp')
    .description('临时视频与种子文件下载存储路径（相对工作区）'),
  autoClean: Schema.boolean()
    .default(true)
    .description('推送成功后是否自动删除本地临时视频与种子缓存'),
  cleanDelay: Schema.number()
    .default(10)
    .description('推送成功到删除临时文件的延迟时间（秒）'),
  serverHost: Schema.string()
    .description('远端协议端获取视频文件时的本机 IP 或域名（留空则自动检测与协议端同网段的局域网/内网 IP）'),
  serverPort: Schema.number()
    .default(0)
    .description('文件传输临时 HTTP 服务端口（0 为使用系统随机空闲端口）'),
  subscriptions: Schema.array(
    Schema.object({
      name: Schema.string().required().description('番剧订阅名称'),
      url: Schema.string().required().description('RSS 订阅链接'),
      channels: Schema.array(Schema.string())
        .role('table')
        .description('推送目标群号或频道（如 123456789 或 onebot:123456789）'),
      include: Schema.array(Schema.string()).description('必须包含的过滤关键词'),
      exclude: Schema.array(Schema.string()).description('排除的过滤关键词'),
      enabled: Schema.boolean().default(true).description('是否启用此订阅'),
    })
  )
    .default([])
    .description('控制台配置的全局静态订阅列表'),
})

export function apply(ctx: Context, config: Config) {
  const logger = new Logger('[anime-rss]')
  const downloaderQueue = new DownloaderQueue()

  // 1. 初始化数据库表结构
  initDatabase(ctx)

  // 2. 确保下载目录存在
  const absoluteStoragePath = path.resolve(ctx.baseDir, config.storagePath)
  fs.mkdirSync(absoluteStoragePath, { recursive: true })

  // 寻找合适 Bot 实例的辅助方法
  function resolveBot(platform?: string, channelId?: string): Bot | undefined {
    if (channelId && channelId.includes(':')) {
      const p = channelId.split(':')[0]
      const bot = ctx.bots.find((b) => b.platform === p && b.isActive)
      if (bot) return bot
    }
    if (platform) {
      const bot = ctx.bots.find((b) => b.platform === platform && b.isActive)
      if (bot) return bot
    }
    return ctx.bots.find((b) => b.isActive) || ctx.bots[0]
  }

  // 3. 核心轮询逻辑
  async function runCheckCycle(
    targetChannelId?: string,
    options?: { maxItems?: number }
  ): Promise<string> {
    logger.info('Starting RSS subscription check cycle...')
    const maxItems = options?.maxItems
    let checkedCount = 0
    let updatedCount = 0

    // 汇总静态配置与动态数据库订阅
    const activeSubs: Array<{
      subKey: string
      name: string
      url: string
      channels: string[]
      platform?: string
      include?: string[]
      exclude?: string[]
    }> = []

    // 静态配置源
    for (const s of config.subscriptions || []) {
      if (s.enabled === false) continue
      activeSubs.push({
        subKey: `static:${s.url}`,
        name: s.name,
        url: s.url,
        channels: s.channels || [],
        include: s.include,
        exclude: s.exclude,
      })
    }

    // 动态数据库源
    try {
      const dbSubs = await getDatabaseSubscriptions(ctx, targetChannelId)
      for (const d of dbSubs) {
        if (!d.enabled) continue
        activeSubs.push({
          subKey: `db:${d.id}`,
          name: d.name,
          url: d.url,
          channels: [d.channelId],
          platform: d.platform,
          include: d.include,
          exclude: d.exclude,
        })
      }
    } catch (err: any) {
      logger.error(`Failed to load database subscriptions: ${err?.message}`)
    }

    // 若指定了目标群，过滤出与该群相关的订阅源
    const currentSubs = targetChannelId
      ? activeSubs.filter((sub) => {
          const cleanTarget = targetChannelId.includes(':')
            ? targetChannelId.split(':')[1]
            : targetChannelId
          return sub.channels.some(
            (c) => c === targetChannelId || c === cleanTarget || c.endsWith(`:${cleanTarget}`)
          )
        })
      : activeSubs

    for (const sub of currentSubs) {
      checkedCount++
      try {
        logger.info(`Fetching RSS feed for "${sub.name}": ${sub.url}`)
        const items = await fetchAndParseRss(ctx, sub.url, {
          include: sub.include,
          exclude: sub.exclude,
        })

        for (const item of items) {
          const isPushed = await isItemPushed(ctx, item.guid, item.infoHash)
          if (isPushed) continue

          logger.info(`New anime episode detected: ${item.title}`)
          updatedCount++

          // 排队下载（串行独占，保障零堆内存激增）
          try {
            const downloadResult = await downloaderQueue.runExclusive(async () => {
              logger.info(`[downloader] Enqueueing download for: ${item.title} (engine: ${config.downloader})`)
              return downloadTorrentItem(
                {
                  torrentUrl: item.torrentUrl,
                  magnetUrl: item.magnetUrl,
                  infoHash: item.infoHash,
                },
                absoluteStoragePath,
                config.downloadTimeout * 60 * 1000,
                async (url: string) => {
                  return ctx.http.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
                },
                config.aria2CustomPath,
                config.downloader,
                (config.stalledTimeout || 120) * 1000,
                (progressStr) => {
                  logger.info(`[downloader] ${progressStr}`)
                }
              )
            })

            // 推送到目标频道
            for (const ch of sub.channels) {
              const bot = resolveBot(sub.platform, ch)
              if (!bot) {
                logger.warn(`No online bot found to push anime to channel ${ch}`)
                continue
              }

              const pushRes = await pushAnimeVideo(bot, {
                channelId: ch,
                filePath: downloadResult.filePath,
                title: item.title,
                fileName: downloadResult.fileName,
                magnetUrl: item.magnetUrl,
                videoSizeThresholdMB: config.videoSizeThreshold,
                uploadTimeoutMs: (config.uploadTimeout || 10) * 60 * 1000,
                serverHost: config.serverHost,
                serverPort: config.serverPort,
                logger,
              })

              logger.info(
                `Pushed "${item.title}" to ${ch} (mode: ${pushRes.mode}, success: ${pushRes.success})`
              )
            }

            // 记录已推送历史
            await recordPushedItem(ctx, {
              subKey: sub.url,
              guid: item.guid,
              title: item.title,
              torrentHash: item.infoHash,
              fileSize: downloadResult.fileSize,
            })

            // 自动清理临时文件
            if (config.autoClean && downloadResult.filePath) {
              setTimeout(async () => {
                try {
                  if (fs.existsSync(downloadResult.filePath)) {
                    await fs.promises.unlink(downloadResult.filePath)
                    // Also clean up parent taskDir if empty or temp
                    const parentDir = path.dirname(downloadResult.filePath)
                    if (parentDir !== absoluteStoragePath && fs.existsSync(parentDir)) {
                      await fs.promises.rm(parentDir, { recursive: true, force: true }).catch(() => {})
                    }
                    logger.info(`Cleaned up temporary video: ${downloadResult.filePath}`)
                  }
                } catch (cleanErr: any) {
                  logger.warn(`Failed to clean up temp file: ${cleanErr?.message}`)
                }
              }, config.cleanDelay * 1000)
            }
          } catch (dlErr: any) {
            logger.warn(`Download/push ended for "${item.title}": ${dlErr?.message}`)
            const isStalled = String(dlErr?.message).includes('暂无活跃做种者')
            const alertPrefix = isStalled ? '⚠️ 【番剧更新提醒】' : '⚠️ 【番剧下载失败】'
            const alertReason = isStalled
              ? '该资源全网暂无活跃做种者(做种数: 0)，已转为提供磁力链接供离线下载'
              : `原因：${dlErr?.message}`

            // 推送失败或死种告警
            for (const ch of sub.channels) {
              const bot = resolveBot(sub.platform, ch)
              if (bot) {
                bot.sendMessage(
                  ch,
                  `${alertPrefix}《${sub.name}》- ${item.title}\n${alertReason}\n${
                    item.magnetUrl ? `备用磁力链接：\n${item.magnetUrl}` : ''
                  }`
                ).catch(() => {})
              }
            }

            // 若确认为死种，将该条记录入库防重，避免每轮轮询反复重试死种
            if (isStalled) {
              await recordPushedItem(ctx, {
                subKey: sub.url,
                guid: item.guid,
                title: item.title,
                torrentHash: item.infoHash,
                fileSize: 0,
              }).catch(() => {})
            }
          }

          if (maxItems && updatedCount >= maxItems) {
            break
          }
        }
        if (maxItems && updatedCount >= maxItems) {
          break
        }
      } catch (feedErr: any) {
        logger.error(`Error processing feed "${sub.name}" (${sub.url}): ${feedErr?.message}`)
      }
    }

    const summary = `检查完成！已巡检 ${checkedCount} 个订阅源，发现并处理 ${updatedCount} 条更新。`
    logger.info(summary)
    return summary
  }

  // 4. 注册指令系统
  registerCommands(ctx, config, (channelId, options) => runCheckCycle(channelId, options))

  // 5. 启动定时检查任务
  if (config.checkInterval > 0) {
    ctx.setInterval(() => {
      runCheckCycle().catch((err) => {
        logger.error(`Scheduled check cycle error: ${err?.message}`)
      })
    }, config.checkInterval * 60 * 1000)
  }
}
