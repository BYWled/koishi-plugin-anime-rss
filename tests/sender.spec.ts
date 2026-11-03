import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import {
  getLocalIpForRemote,
  getLocalIpForRemoteAsync,
  getBotSocket,
  createTemporaryFileServer,
  invokeOneBotAction,
  pushAnimeVideo,
  parseHostAndPort,
  sanitizeHost,
} from '../src/sender'

test('sender: parseHostAndPort and sanitizeHost correctly normalize user inputs', () => {
  assert.equal(sanitizeHost('http://192.168.192.43'), '192.168.192.43')
  assert.equal(sanitizeHost('https://192.168.192.43/'), '192.168.192.43')
  assert.equal(sanitizeHost('http://http://192.168.192.43'), '192.168.192.43')
  assert.equal(sanitizeHost('http://https://192.168.192.43:53940/path'), '192.168.192.43')
  assert.equal(sanitizeHost('192.168.192.43'), '192.168.192.43')
  assert.equal(sanitizeHost('  http://example.com/  '), 'example.com')

  const parsedMulti = parseHostAndPort('http://http://192.168.192.43:1238', 0)
  assert.equal(parsedMulti.host, '192.168.192.43')
  assert.equal(parsedMulti.port, 1238)

  const parsed = parseHostAndPort('http://192.168.192.43:1238', 0)
  assert.equal(parsed.host, '192.168.192.43')
  assert.equal(parsed.port, 1238)

  const parsedDefault = parseHostAndPort('192.168.192.43', 8080)
  assert.equal(parsedDefault.host, '192.168.192.43')
  assert.equal(parsedDefault.port, 8080)
})

test('sender: getLocalIpForRemote handles localhost and remote hosts', () => {
  assert.equal(getLocalIpForRemote('127.0.0.1'), '127.0.0.1')
  assert.equal(getLocalIpForRemote('localhost'), '127.0.0.1')
  assert.equal(getLocalIpForRemote('::1'), '127.0.0.1')

  const ip = getLocalIpForRemote('192.168.192.216')
  assert.ok(typeof ip === 'string' && ip.length > 0)
})

test('sender: createTemporaryFileServer sanitizes http:// in host and prevents http://http:// duplication', async () => {
  const tempPath = path.resolve('temp_test_proto.txt')
  fs.writeFileSync(tempPath, 'Hello Protocol Sanitize')
  try {
    const serverInfo = await createTemporaryFileServer(tempPath, 'http://127.0.0.1', 0)
    assert.ok(!serverInfo.url.includes('http://http://'))
    assert.ok(serverInfo.url.startsWith('http://127.0.0.1:'))
    serverInfo.close()
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

test('sender: createTemporaryFileServer streams file via HTTP with zero memory buffer', async () => {
  const tempPath = path.resolve('temp_test_unit.txt')
  fs.writeFileSync(tempPath, 'Hello Koishi Anime Push Test')

  try {
    const serverInfo = await createTemporaryFileServer(tempPath, '127.0.0.1', 0)
    assert.ok(serverInfo.url.startsWith('http://127.0.0.1:'))
    assert.ok(serverInfo.url.endsWith('temp_test_unit.txt'))

    // 1. Valid request to serverInfo.url
    const content = await new Promise<string>((resolve, reject) => {
      http.get(serverInfo.url, (res) => {
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['content-length'], String(fs.statSync(tempPath).size))
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve(body))
      }).on('error', reject)
    })
    assert.equal(content, 'Hello Koishi Anime Push Test')

    // 2. Invalid request should return 404
    const notFoundStatus = await new Promise<number>((resolve, reject) => {
      const url = new URL(serverInfo.url)
      http.get(`http://${url.host}/invalid_path`, (res) => {
        resolve(res.statusCode || 0)
      }).on('error', reject)
    })
    assert.equal(notFoundStatus, 404)

    serverInfo.close()
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

test('sender: invokeOneBotAction handles websocket request and response with custom timeout', async () => {
  const emitter = new EventEmitter()
  const sentPayloads: string[] = []

  const mockSocket: any = {
    send: (msg: string) => {
      sentPayloads.push(msg)
      const data = JSON.parse(msg)
      // Simulate asynchronous OneBot server reply
      setTimeout(() => {
        emitter.emit('message', {
          data: JSON.stringify({
            echo: data.echo,
            status: 'ok',
            retcode: 0,
            data: { file_id: 'uploaded_123' },
          }),
        })
      }, 20)
    },
    addEventListener: (event: string, handler: any) => {
      emitter.on(event, handler)
    },
    removeEventListener: (event: string, handler: any) => {
      emitter.off(event, handler)
    },
  }

  const mockBot: any = {
    adapter: { socket: mockSocket },
  }

  const result = await invokeOneBotAction(
    mockBot,
    'upload_group_file',
    { group_id: 123456, file: 'http://test', name: 'test.mp4' },
    5000
  )

  assert.equal(result.file_id, 'uploaded_123')
  assert.equal(sentPayloads.length, 1)
  const sent = JSON.parse(sentPayloads[0])
  assert.equal(sent.action, 'upload_group_file')
  assert.equal(sent.params.group_id, 123456)
})

test('sender: invokeOneBotAction times out if no reply received within timeoutMs', async () => {
  const emitter = new EventEmitter()
  const mockSocket: any = {
    send: () => {}, // do not reply
    addEventListener: (event: string, handler: any) => {
      emitter.on(event, handler)
    },
    removeEventListener: (event: string, handler: any) => {
      emitter.off(event, handler)
    },
  }

  const mockBot: any = {
    adapter: { socket: mockSocket },
  }

  await assert.rejects(
    () =>
      invokeOneBotAction(
        mockBot,
        'upload_group_file',
        { group_id: 123456 },
        50 // 50ms short timeout for testing
      ),
    /Timeout with request upload_group_file after 0s/
  )
})

test('sender: pushAnimeVideo with small file sends regular video message', async () => {
  const tempPath = path.resolve('temp_small.mp4')
  fs.writeFileSync(tempPath, 'dummy video')

  const sentMessages: any[] = []
  const mockBot: any = {
    platform: 'onebot',
    sendMessage: async (channelId: string, content: any) => {
      sentMessages.push({ channelId, content })
      return ['msg_1']
    },
    internal: {},
  }

  try {
    const res = await pushAnimeVideo(mockBot, {
      channelId: '123456789',
      filePath: tempPath,
      title: 'Small Anime Episode',
      videoSizeThresholdMB: 80,
    })

    assert.equal(res.success, true)
    assert.equal(res.mode, 'video')
    assert.equal(sentMessages.length, 1)
    assert.equal(sentMessages[0].channelId, '123456789')
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

test('sender: pushAnimeVideo for remote OneBot sends group file via streaming HTTP with custom timeout', async () => {
  const tempPath = path.resolve('temp_large.mp4')
  fs.writeFileSync(tempPath, Buffer.alloc(2 * 1024 * 1024, 0))

  const emitter = new EventEmitter()
  const sentPayloads: string[] = []
  const sentMessages: any[] = []

  const mockSocket: any = {
    send: (msg: string) => {
      sentPayloads.push(msg)
      const data = JSON.parse(msg)
      // Simulate remote OneBot reply after stream connection
      setTimeout(() => {
        emitter.emit('message', {
          data: JSON.stringify({
            echo: data.echo,
            status: 'ok',
            retcode: 0,
            data: { file_id: 'group_file_remote_success' },
          }),
        })
      }, 50)
    },
    addEventListener: (event: string, handler: any) => {
      emitter.on(event, handler)
    },
    removeEventListener: (event: string, handler: any) => {
      emitter.off(event, handler)
    },
  }

  const mockBot: any = {
    platform: 'onebot',
    config: {
      endpoint: 'ws://192.168.192.216:3001',
    },
    adapter: {
      socket: mockSocket,
    },
    sendMessage: async (channelId: string, content: any) => {
      sentMessages.push({ channelId, content })
      return ['msg_2']
    },
    internal: {},
  }

  try {
    const res = await pushAnimeVideo(mockBot, {
      channelId: '123456789',
      filePath: tempPath,
      title: 'Large Anime Episode',
      videoSizeThresholdMB: 1, // force Mode 2
      serverHost: '127.0.0.1',
      uploadTimeoutMs: 60000,
    })

    assert.equal(res.success, true)
    assert.equal(res.mode, 'group_file')
    assert.equal(sentPayloads.length, 1)
    const payload = JSON.parse(sentPayloads[0])
    assert.equal(payload.action, 'upload_group_file')
    assert.equal(payload.params.group_id, 123456789)
    assert.ok(payload.params.file.startsWith('http://127.0.0.1:'), 'Should pass HTTP stream URL')
    assert.equal(payload.params.name, 'temp_large.mp4')
    assert.ok(sentMessages.some((m) => m.content.includes('已成功上传至群文件')))
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

test('sender: createTemporaryFileServer handles HEAD and Range partial requests', async () => {
  const tempPath = path.resolve('temp_test_range.txt')
  fs.writeFileSync(tempPath, '0123456789ABCDEF')

  try {
    const serverInfo = await createTemporaryFileServer(tempPath, '127.0.0.1', 0)

    // 1. HEAD request
    const headRes = await new Promise<{ statusCode?: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const url = new URL(serverInfo.url)
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'HEAD',
        },
        (res) => {
          resolve({ statusCode: res.statusCode, headers: res.headers })
        }
      )
      req.on('error', reject)
      req.end()
    })
    assert.equal(headRes.statusCode, 200)
    assert.equal(headRes.headers['content-length'], '16')
    assert.equal(headRes.headers['accept-ranges'], 'bytes')

    // 2. Range request: bytes=4-9
    const rangeContent = await new Promise<{ statusCode?: number; body: string; rangeHeader?: string }>(
      (resolve, reject) => {
        const url = new URL(serverInfo.url)
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            headers: { Range: 'bytes=4-9' },
          },
          (res) => {
            let body = ''
            res.on('data', (c) => (body += c))
            res.on('end', () =>
              resolve({
                statusCode: res.statusCode,
                body,
                rangeHeader: res.headers['content-range'],
              })
            )
          }
        )
        req.on('error', reject)
        req.end()
      }
    )
    assert.equal(rangeContent.statusCode, 206)
    assert.equal(rangeContent.body, '456789')
    assert.equal(rangeContent.rangeHeader, 'bytes 4-9/16')

    serverInfo.close(true)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})

test('sender: invokeOneBotAction succeeds on OneBot retcode: 1 / status: "async"', async () => {
  const emitter = new EventEmitter()
  const mockSocket: any = {
    send: (msg: string) => {
      const data = JSON.parse(msg)
      setTimeout(() => {
        emitter.emit('message', {
          data: JSON.stringify({
            echo: data.echo,
            status: 'async',
            retcode: 1,
            data: null,
          }),
        })
      }, 20)
    },
    addEventListener: (event: string, handler: any) => {
      emitter.on(event, handler)
    },
    removeEventListener: (event: string, handler: any) => {
      emitter.off(event, handler)
    },
  }

  const mockBot: any = {
    adapter: { socket: mockSocket },
  }

  const result = await invokeOneBotAction(
    mockBot,
    'upload_group_file',
    { group_id: 123456, file: 'http://test', name: 'async_test.mp4' },
    5000
  )

  assert.equal(result, null)
})

test('sender: pushAnimeVideo returns success: false when upload_group_file fails', async () => {
  const tempPath = path.resolve('temp_large_fail.mp4')
  fs.writeFileSync(tempPath, Buffer.alloc(2 * 1024 * 1024, 0))

  const emitter = new EventEmitter()
  const mockSocket: any = {
    send: (msg: string) => {
      const data = JSON.parse(msg)
      // Simulate remote OneBot reporting failure
      setTimeout(() => {
        emitter.emit('message', {
          data: JSON.stringify({
            echo: data.echo,
            status: 'failed',
            retcode: 1200,
            message: 'getaddrinfo ENOTFOUND host',
          }),
        })
      }, 20)
    },
    addEventListener: (event: string, handler: any) => {
      emitter.on(event, handler)
    },
    removeEventListener: (event: string, handler: any) => {
      emitter.off(event, handler)
    },
  }

  const mockBot: any = {
    platform: 'onebot',
    config: {
      endpoint: 'ws://192.168.192.216:3001',
    },
    adapter: {
      socket: mockSocket,
    },
    sendMessage: async () => ['msg_fail'],
    internal: {
      uploadGroupFile: () => {},
    },
  }

  try {
    const res = await pushAnimeVideo(mockBot, {
      channelId: '123456789',
      filePath: tempPath,
      title: 'Failed Anime Episode',
      videoSizeThresholdMB: 1, // force Mode 2
      serverHost: '127.0.0.1',
      uploadTimeoutMs: 10000,
    })

    assert.equal(res.success, false, 'Failed upload must return success: false')
    assert.equal(res.mode, 'group_file')
    assert.ok(res.error?.includes('upload_group_file failed'))
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
})
