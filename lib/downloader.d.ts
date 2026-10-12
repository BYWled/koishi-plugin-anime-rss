import { DownloadResult } from './types';
export declare const DEFAULT_TRACKERS: string[];
export declare function isVideoFile(fileName: string): boolean;
export declare function resolveAria2Binary(customPath?: string): string | null;
export declare class DownloaderQueue {
    private queue;
    private isProcessing;
    runExclusive<T>(fn: () => Promise<T>): Promise<T>;
    private processNext;
    get pendingCount(): number;
    get active(): boolean;
}
export declare function downloadViaAria2(aria2Bin: string, source: {
    torrentUrl?: string;
    magnetUrl?: string;
    infoHash?: string;
}, outputDir: string, timeoutMs?: number, httpGetter?: (url: string) => Promise<ArrayBuffer>, stalledTimeoutMs?: number, onProgress?: (progressStr: string) => void): Promise<DownloadResult>;
export declare function downloadViaTorrentStream(source: {
    torrentUrl?: string;
    magnetUrl?: string;
    infoHash?: string;
}, outputDir: string, timeoutMs?: number, httpGetter?: (url: string) => Promise<ArrayBuffer>): Promise<DownloadResult>;
export declare function downloadTorrentItem(source: {
    torrentUrl?: string;
    magnetUrl?: string;
    infoHash?: string;
}, outputDir: string, timeoutMs?: number, httpGetter?: (url: string) => Promise<ArrayBuffer>, customAria2Path?: string, forceEngine?: 'builtin-aria2' | 'torrent-stream', stalledTimeoutMs?: number, onProgress?: (progressStr: string) => void): Promise<DownloadResult>;
