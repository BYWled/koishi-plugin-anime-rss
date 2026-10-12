import { XMLParser } from 'fast-xml-parser'
import { Context } from 'koishi'
import { RssFeedItem } from './types'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  cdataPropName: '__cdata',
})

function getText(val: any): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    if (val.__cdata !== undefined) return String(val.__cdata).trim()
    if (val['#text'] !== undefined) return String(val['#text']).trim()
  }
  return ''
}

export function matchesFilter(
  title: string,
  include?: string[],
  exclude?: string[]
): boolean {
  const lowerTitle = title.toLowerCase()

  if (include && include.length > 0) {
    const hasAnyInclude = include.some((kw) => {
      const k = kw.trim().toLowerCase()
      return k.length > 0 && lowerTitle.includes(k)
    })
    if (!hasAnyInclude) return false
  }

  if (exclude && exclude.length > 0) {
    const hasAnyExclude = exclude.some((kw) => {
      const k = kw.trim().toLowerCase()
      return k.length > 0 && lowerTitle.includes(k)
    })
    if (hasAnyExclude) return false
  }

  return true
}

export function parseRssXml(xmlContent: string): RssFeedItem[] {
  const parsed = parser.parse(xmlContent)
  const itemsRaw =
    parsed?.rss?.channel?.item ||
    parsed?.feed?.entry ||
    parsed?.['rdf:RDF']?.item ||
    []

  const itemArray = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw]
  const results: RssFeedItem[] = []

  for (const raw of itemArray) {
    if (!raw) continue
    const title = getText(raw.title)
    if (!title) continue

    const link =
      getText(raw.link) ||
      raw.link?.['@_href'] ||
      ''
    const guid = getText(raw.guid) || link || title
    const pubDate = getText(raw.pubDate) || getText(raw.updated)

    let torrentUrl = raw.enclosure?.['@_url'] || ''
    let fileSize: number | undefined
    if (raw.enclosure?.['@_length']) {
      const parsedLen = parseInt(raw.enclosure['@_length'], 10)
      if (!isNaN(parsedLen)) fileSize = parsedLen
    }

    let infoHash: string | undefined
    let magnetUrl: string | undefined

    if (link.startsWith('magnet:?')) {
      magnetUrl = link
    } else if (torrentUrl.startsWith('magnet:?')) {
      magnetUrl = torrentUrl
      torrentUrl = ''
    }

    // Try extracting infoHash from magnet, torrentUrl, guid, or link
    const searchTarget = `${magnetUrl || ''} ${torrentUrl} ${link} ${guid}`
    const btihMatch = searchTarget.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i)
    if (btihMatch) {
      infoHash = btihMatch[1].toLowerCase()
    } else {
      const hashParamMatch = searchTarget.match(/hash=([a-fA-F0-9]{40})/i)
      if (hashParamMatch) {
        infoHash = hashParamMatch[1].toLowerCase()
      } else {
        const hex40Match = searchTarget.match(/(?:show-|download\/|[a-fA-F0-9]{40})([a-fA-F0-9]{40})/i)
        if (hex40Match) {
          infoHash = (hex40Match[1] || hex40Match[0]).toLowerCase()
        }
      }
    }

    if (!magnetUrl && infoHash) {
      magnetUrl = `magnet:?xt=urn:btih:${infoHash}`
    }

    results.push({
      title,
      link,
      guid,
      pubDate,
      torrentUrl: torrentUrl || undefined,
      magnetUrl: magnetUrl || undefined,
      infoHash,
      fileSize,
    })
  }

  return results
}

export async function fetchAndParseRss(
  ctx: Context,
  url: string,
  filter?: { include?: string[]; exclude?: string[] }
): Promise<RssFeedItem[]> {
  let xml: string
  try {
    xml = await ctx.http.get<string>(url, {
      responseType: 'text',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
      timeout: 30000,
    })
  } catch (httpErr) {
    // Fallback to native https request for complex URLs that undici might re-encode
    xml = await new Promise<string>((resolve, reject) => {
      const https = require('https')
      https
        .get(
          url,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: '*/*',
            },
          },
          (res: any) => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode} from ${url}`))
            }
            let data = ''
            res.on('data', (c: any) => (data += c))
            res.on('end', () => resolve(data))
          }
        )
        .on('error', reject)
    })
  }

  const allItems = parseRssXml(xml)

  if (!filter || (!filter.include?.length && !filter.exclude?.length)) {
    return allItems
  }

  return allItems.filter((item) =>
    matchesFilter(item.title, filter.include, filter.exclude)
  )
}
