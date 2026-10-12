declare module 'torrent-stream' {
  import { EventEmitter } from 'events'
  import { Readable } from 'stream'

  namespace torrentStream {
    interface TorrentFile extends EventEmitter {
      name: string
      path: string
      length: number
      createReadStream(options?: { start?: number; end?: number }): Readable
      select(): void
      deselect(): void
    }

    interface TorrentEngine extends EventEmitter {
      files: TorrentFile[]
      torrent?: any
      infoHash: string
      destroy(cb?: () => void): void
      on(event: 'ready', listener: () => void): this
      on(event: 'torrent', listener: (torrent: any) => void): this
      on(event: 'idle', listener: () => void): this
      on(event: 'download', listener: (pieceIndex: number) => void): this
      on(event: 'upload', listener: (pieceIndex: number, offset: number, length: number) => void): this
      on(event: string | symbol, listener: (...args: any[]) => void): this
    }

    interface TorrentOptions {
      connections?: number
      uploads?: number
      tmp?: string
      path?: string
      verify?: boolean
      dht?: boolean
      tracker?: boolean
      trackers?: string[]
    }
  }

  function torrentStream(target: string | Buffer, options?: torrentStream.TorrentOptions): torrentStream.TorrentEngine

  export = torrentStream
}
