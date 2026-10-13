import { Context, Session } from 'koishi'
import { Config } from './types'
import { TrackerManager } from './tracker'
import {
  getDatabaseSubscriptions,
  addDatabaseSubscription,
  removeDatabaseSubscription,
} from './database'
import { fetchAndParseRss } from './rss'

export function registerCommands(
  ctx: Context,
  config: Config,
  triggerCheck: (channelId?: string, options?: { maxItems?: number }) => Promise<string>,
  trackerManager?: TrackerManager
) {
  const cmd = ctx.command('anime-rss', 'RSS 番剧订阅与推送管理')

  cmd.action(async ({ session }) => {
    return [
      '📺 === RSS 番剧订阅管理 ===',
      '可用指令：',
      '  anime-rss.add <url> [name]  添加番剧订阅',
      '    -i, --include <kw1,kw2>   仅下载包含特定关键词的内容（逗号分隔）',
      '    -e, --exclude <kw1,kw2>   排除包含特定关键词的内容',
      '  anime-rss.remove <id>       删除指定 ID 的订阅',
      '  anime-rss.list              查看当前群生效的番剧订阅列表',
      '  anime-rss.check             立即执行一次订阅检查与更新探测',
      '  anime-rss.tracker           查看或更新当前 BT Tracker 服务器池',
    ].join('\n')
  })

  cmd
    .subcommand('.add <url:string> [name:string]', '添加番剧订阅')
    .option('include', '-i <keywords:string> 仅下载包含特定关键词的内容（逗号分隔）')
    .option('exclude', '-e <keywords:string> 排除包含特定关键词的内容')
    .action(async ({ session, options }, url, name) => {
      if (!session?.channelId) {
        return '请在群聊或频道中使用此指令。'
      }

      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return '请输入合法的 RSS 链接（以 http:// 或 https:// 开头）。'
      }

      let subName = name?.trim()
      if (!subName) {
        try {
          const items = await fetchAndParseRss(ctx, url)
          subName = items[0]?.title ? items[0].title.slice(0, 30) : '未命名番剧'
        } catch {
          subName = '新番订阅'
        }
      }

      const includeList = options?.include
        ? options.include.split(',').map((s) => s.trim()).filter(Boolean)
        : []
      const excludeList = options?.exclude
        ? options.exclude.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      try {
        const record = await addDatabaseSubscription(ctx, {
          name: subName,
          url,
          platform: session.platform || 'onebot',
          guildId: session.guildId,
          channelId: session.channelId,
          include: includeList,
          exclude: excludeList,
          enabled: true,
        })

        let msg = `✅ 订阅成功！\n- ID: ${record.id}\n- 名称: ${record.name}\n- 链接: ${record.url}`
        if (includeList.length) msg += `\n- 包含过滤: ${includeList.join(', ')}`
        if (excludeList.length) msg += `\n- 排除过滤: ${excludeList.join(', ')}`
        return msg
      } catch (err: any) {
        return `❌ 添加订阅失败: ${err?.message}`
      }
    })

  cmd
    .subcommand('.remove <id:number>', '删除指定订阅')
    .action(async ({ session }, id) => {
      if (!session?.channelId) {
        return '请在群聊或频道中使用此指令。'
      }

      if (!id) {
        return '请输入要删除的订阅 ID。'
      }

      const success = await removeDatabaseSubscription(ctx, id, session.channelId)
      if (success) {
        return `✅ 已成功删除 ID 为 ${id} 的番剧订阅。`
      } else {
        return `❌ 未找到 ID 为 ${id} 的当前群订阅，请使用 anime-rss.list 确认。`
      }
    })

  cmd
    .subcommand('.list', '查看当前群订阅列表')
    .action(async ({ session }) => {
      if (!session?.channelId) {
        return '请在群聊或频道中使用此指令。'
      }

      const currentChannel = session.channelId
      const cleanTarget = currentChannel.includes(':')
        ? currentChannel.split(':')[1]
        : currentChannel

      // 1. Static subscriptions from config
      const staticSubs = (config.subscriptions || []).filter((sub) => {
        if (!sub.channels || sub.channels.length === 0) return true
        return sub.channels.some(
          (c) => c === currentChannel || c === cleanTarget || c.endsWith(`:${cleanTarget}`)
        )
      })

      // 2. Dynamic subscriptions from database
      const dbSubs = await getDatabaseSubscriptions(ctx, currentChannel)

      if (staticSubs.length === 0 && dbSubs.length === 0) {
        return '当前群暂无番剧订阅。使用 `anime-rss.add <url>` 添加订阅！'
      }

      const lines = [`📋 当前群番剧订阅列表（共 ${staticSubs.length + dbSubs.length} 个）：`]

      if (staticSubs.length > 0) {
        lines.push('\n[控制台静态配置]')
        staticSubs.forEach((sub, idx) => {
          lines.push(
            `  • [静态-${idx + 1}] ${sub.name} (${sub.enabled ? '已启用' : '已暂停'})`
          )
          lines.push(`    URL: ${sub.url}`)
          if (sub.include?.length) lines.push(`    包含: ${sub.include.join(', ')}`)
          if (sub.exclude?.length) lines.push(`    排除: ${sub.exclude.join(', ')}`)
        })
      }

      if (dbSubs.length > 0) {
        lines.push('\n[群指令动态订阅]')
        dbSubs.forEach((sub) => {
          lines.push(
            `  • [ID: ${sub.id}] ${sub.name} (${sub.enabled ? '已启用' : '已暂停'})`
          )
          lines.push(`    URL: ${sub.url}`)
          if (sub.include?.length) lines.push(`    包含: ${sub.include.join(', ')}`)
          if (sub.exclude?.length) lines.push(`    排除: ${sub.exclude.join(', ')}`)
        })
      }

      return lines.join('\n')
    })

  cmd
    .subcommand('.check', '立即触发一次订阅检查（默认仅测试最新的 1 个未推送剧集）')
    .option('all', '-a 检查所有未推送的历史更新')
    .action(async ({ session, options }) => {
      await session?.send('🔍 正在触发 RSS 番剧更新检查，请稍候...')
      try {
        const maxItems = options?.all ? undefined : 1
        const summary = await triggerCheck(session?.channelId, { maxItems })
        return summary
      } catch (err: any) {
        return `❌ 检查过程发生异常: ${err?.message}`
      }
    })

  cmd
    .subcommand('.tracker', '查看或更新当前 BT Tracker 节点池状态')
    .option('update', '-u, --update 立即从国内外多镜像源强制同步最新 Tracker 列表')
    .action(async ({ session, options }) => {
      if (!trackerManager) {
        return 'Tracker 管理器未就绪。'
      }

      if (options?.update) {
        await session?.send('📡 正在从全网优质镜像源同步最新 BT Tracker 列表，请稍候...')
        const count = await trackerManager.syncTrackers(ctx, true, config.customTrackers || [])
        return `✅ Tracker 同步完成！当前池中活跃 Tracker 总数：${count} 个（已持久化缓存并就绪）。`
      }

      const trackers = trackerManager.getTrackers(config.customTrackers || [])
      const sample = trackers.slice(0, 5).join('\n  • ')
      return [
        '📡 === BT Tracker 状态 ===',
        `• 可用 Tracker 节点总数：${trackers.length} 个`,
        '• DHT 持久化路由表：已启用（dht.dat + dht6.dat）',
        '• 多镜像自动同步：' + (config.trackerSync !== false ? '已开启' : '已关闭'),
        '• 提示：使用 `anime-rss.tracker -u` 可立即强制从镜像源刷新最新节点列表。',
        `\n[部分优质节点预览]：\n  • ${sample}`,
      ].join('\n')
    })
}
