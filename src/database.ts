import { Context } from 'koishi'
import { RssAnimeSubscription, RssAnimeHistory } from './types'

declare module 'koishi' {
  interface Tables {
    rss_anime_subscription: RssAnimeSubscription
    rss_anime_history: RssAnimeHistory
  }
}

export function initDatabase(ctx: Context) {
  ctx.model.extend('rss_anime_subscription', {
    id: 'unsigned',
    name: 'string',
    url: 'string',
    platform: 'string',
    guildId: 'string',
    channelId: 'string',
    include: 'list',
    exclude: 'list',
    enabled: { type: 'boolean', initial: true },
    createdAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('rss_anime_history', {
    id: 'unsigned',
    subKey: 'string',
    guid: 'string',
    title: 'string',
    torrentHash: 'string',
    fileSize: 'integer',
    pushedAt: 'timestamp',
  }, {
    primary: 'id',
    autoInc: true,
  })
}

export async function getDatabaseSubscriptions(ctx: Context, channelId?: string) {
  if (channelId) {
    return ctx.database.get('rss_anime_subscription', { channelId })
  }
  return ctx.database.get('rss_anime_subscription', {})
}

export async function addDatabaseSubscription(
  ctx: Context,
  sub: Omit<RssAnimeSubscription, 'id' | 'createdAt'>
) {
  return ctx.database.create('rss_anime_subscription', {
    ...sub,
    createdAt: new Date(),
  })
}

export async function removeDatabaseSubscription(
  ctx: Context,
  id: number,
  channelId?: string
) {
  const query: any = { id }
  if (channelId) {
    query.channelId = channelId
  }
  const records = await ctx.database.get('rss_anime_subscription', query)
  if (!records.length) return false
  await ctx.database.remove('rss_anime_subscription', query)
  return true
}

export async function isItemPushed(
  ctx: Context,
  guid: string,
  infoHash?: string
): Promise<boolean> {
  const byGuid = await ctx.database.get('rss_anime_history', { guid })
  if (byGuid.length > 0) return true

  if (infoHash) {
    const byHash = await ctx.database.get('rss_anime_history', { torrentHash: infoHash.toLowerCase() })
    if (byHash.length > 0) return true
  }

  return false
}

export async function recordPushedItem(
  ctx: Context,
  item: Omit<RssAnimeHistory, 'id' | 'pushedAt'>
) {
  return ctx.database.create('rss_anime_history', {
    ...item,
    torrentHash: item.torrentHash ? item.torrentHash.toLowerCase() : undefined,
    pushedAt: new Date(),
  })
}
