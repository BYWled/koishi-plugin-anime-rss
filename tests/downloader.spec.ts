import test from 'node:test'
import assert from 'node:assert/strict'
import { DownloaderQueue } from '../src/downloader'

test('DownloaderQueue should maintain FIFO ordering and serial execution', async () => {
  const queue = new DownloaderQueue()
  const order: number[] = []

  let runningCount = 0
  let maxConcurrent = 0

  const mockTask = (id: number, delayMs: number) => {
    return queue.runExclusive(async () => {
      runningCount++
      if (runningCount > maxConcurrent) maxConcurrent = runningCount
      order.push(id)
      await new Promise((r) => setTimeout(r, delayMs))
      runningCount--
      return id
    })
  }

  const p1 = mockTask(1, 40)
  const p2 = mockTask(2, 20)
  const p3 = mockTask(3, 10)

  const results = await Promise.all([p1, p2, p3])

  assert.deepEqual(results, [1, 2, 3])
  assert.deepEqual(order, [1, 2, 3])
  assert.equal(maxConcurrent, 1, 'Max concurrent tasks must strictly be 1')
})

test('resolveAria2Binary should detect bundled or system aria2', () => {
  const { resolveAria2Binary } = require('../src/downloader')
  const bin = resolveAria2Binary()
  assert.ok(bin, 'Should successfully resolve bundled aria2c')
})
