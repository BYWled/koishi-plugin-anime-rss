import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { TrackerManager, DEFAULT_FALLBACK_TRACKERS } from '../src/tracker'

test('TrackerManager: should initialize with fallback trackers and paths', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'))
  try {
    const manager = new TrackerManager(tmpDir)
    const trackers = manager.getTrackers()
    assert.ok(trackers.length >= DEFAULT_FALLBACK_TRACKERS.length)
    assert.ok(manager.getDhtFilePath().includes('dht.dat'))
    assert.ok(manager.getDht6FilePath().includes('dht6.dat'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('TrackerManager: parseTrackerString should handle comma and newline separated lists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'))
  try {
    const manager = new TrackerManager(tmpDir)
    const raw = `
      http://tracker1.com/announce,udp://tracker2.com:1337/announce
      https://tracker3.com/announce
      invalid-tracker-url
      udp://tracker4.com:6969/announce
    `
    const parsed = manager.parseTrackerString(raw)
    assert.equal(parsed.length, 4)
    assert.ok(parsed.includes('http://tracker1.com/announce'))
    assert.ok(parsed.includes('udp://tracker2.com:1337/announce'))
    assert.ok(parsed.includes('https://tracker3.com/announce'))
    assert.ok(parsed.includes('udp://tracker4.com:6969/announce'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('TrackerManager: getTrackers should merge custom trackers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'))
  try {
    const manager = new TrackerManager(tmpDir)
    const custom = ['http://custom.tracker.org:8080/announce', 'https://another.custom.net/announce']
    const merged = manager.getTrackers(custom)
    assert.ok(merged.includes('http://custom.tracker.org:8080/announce'))
    assert.ok(merged.includes('https://another.custom.net/announce'))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('TrackerManager: injectTrackersIntoMagnet should append tr parameters', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-test-'))
  try {
    const manager = new TrackerManager(tmpDir)
    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'
    const injected = manager.injectTrackersIntoMagnet(magnet, 5)
    assert.ok(injected.startsWith(magnet))
    assert.ok(injected.includes('&tr='))
    const trCount = (injected.match(/&tr=/g) || []).length
    assert.equal(trCount, 5)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
