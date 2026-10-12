import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRssXml, matchesFilter } from '../src/rss'

const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
<channel>
<title><![CDATA[罗小黑 日配]]></title>
<link>http://kisssub.org</link>
<description><![CDATA[爱恋动漫]]></description>
<lastBuildDate>Mon, 12 Oct 2026 18:26:14 +0800</lastBuildDate>
<language>zh-cn</language>
<item>
    <title><![CDATA[[黒ネズミたち] 罗小黑战记（日配版） / The Legend of Luoxiaohei (Japanese Dub) - 13 (ABEMA 1280x720 AVC AAC MP4)]]></title>
    <link>http://kisssub.org/show-cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4.html</link>
    <description><![CDATA[[黒ネズミたち] 罗小黑战记（日配版） / The Legend of Luoxiaohei (Japanese Dub) - 13 (ABEMA 1280x720 AVC AAC MP4)]]></description>
    <guid isPermaLink="true">http://kisssub.org/show-cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4.html</guid>
    <author><![CDATA[Kirara Fantasia]]></author>
    <enclosure url="http://v2.uploadbt.com/?r=down&amp;hash=cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4" type="application/x-bittorrent" />
    <pubDate>Mon, 29 Dec 2025 01:40:02 +0800</pubDate>
    <category domain="http://kisssub.org/sort-1-1.html"><![CDATA[动画]]></category>
</item>
<item>
    <title><![CDATA[[黒ネズミたち] 罗小黑战记（日配版） - 12 (1080p MP4)]]></title>
    <link>http://kisssub.org/show-03757f7bc94d38815c349e916533e165f72ab06f.html</link>
    <guid>http://kisssub.org/show-03757f7bc94d38815c349e916533e165f72ab06f.html</guid>
    <enclosure url="http://v2.uploadbt.com/?r=down&amp;hash=03757f7bc94d38815c349e916533e165f72ab06f" type="application/x-bittorrent" />
    <pubDate>Mon, 22 Dec 2025 01:40:09 +0800</pubDate>
</item>
</channel>
</rss>`

test('parseRssXml should extract items, torrent urls, and infoHashes correctly', () => {
  const items = parseRssXml(sampleXml)
  assert.equal(items.length, 2)

  const item1 = items[0]
  assert.ok(item1.title.includes('13'))
  assert.equal(item1.guid, 'http://kisssub.org/show-cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4.html')
  assert.equal(item1.infoHash, 'cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4')
  assert.equal(item1.torrentUrl, 'http://v2.uploadbt.com/?r=down&hash=cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4')
  assert.equal(item1.magnetUrl, 'magnet:?xt=urn:btih:cef9e5e0c2ffa7e3f4bcd4d811bce9debd1308a4')

  const item2 = items[1]
  assert.ok(item2.title.includes('12'))
  assert.equal(item2.infoHash, '03757f7bc94d38815c349e916533e165f72ab06f')
})

test('matchesFilter should filter by include and exclude rules', () => {
  const title1 = '[字幕组] 某科学的超电磁炮 - 01 [1080p][简日双语]'
  const title2 = '[字幕组] 某科学的超电磁炮 - 01 [720p][繁体]'

  assert.equal(matchesFilter(title1, ['1080p'], ['720p']), true)
  assert.equal(matchesFilter(title2, ['1080p'], ['720p']), false)
  assert.equal(matchesFilter(title1, undefined, ['繁体']), true)
  assert.equal(matchesFilter(title2, undefined, ['繁体']), false)
  assert.equal(matchesFilter(title1, ['4k'], undefined), false)
})
