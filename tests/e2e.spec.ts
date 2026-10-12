import test from 'node:test'
import assert from 'node:assert/strict'
import https from 'node:https'
import { parseRssXml, matchesFilter } from '../src/rss'

const TEST_RSS_URL = 'https://kisssub.org/rss-%E7%BD%97%E5%B0%8F%E9%BB%91+%E6%97%A5%E9%85%8D.xml'

function fetchHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP error ${res.statusCode}`))
        }
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve(data))
      }
    ).on('error', reject)
  })
}

test('E2E: Fetch and parse real test RSS feed from KissSub', async () => {
  const xml = await fetchHttps(TEST_RSS_URL)
  assert.ok(xml.includes('<rss'), 'Response should be valid RSS XML')

  const items = parseRssXml(xml)
  assert.ok(items.length > 0, 'Should parse at least one anime item')

  const first = items[0]
  assert.ok(first.title.includes('罗小黑') || first.title.includes('Luoxiaohei'))
  assert.ok(first.infoHash || first.torrentUrl, 'Item must have infoHash or torrentUrl')
  assert.ok(first.guid, 'Item must have guid')

  // Verify keyword filtering
  const filteredInclude = items.filter((item) => matchesFilter(item.title, ['1280x720']))
  assert.ok(filteredInclude.length > 0, 'Filter with [1280x720] should match episodes')

  const filteredExclude = items.filter((item) => matchesFilter(item.title, undefined, ['1280x720']))
  assert.ok(filteredExclude.length < items.length, 'Filter excluding [1280x720] should exclude episodes')
})
