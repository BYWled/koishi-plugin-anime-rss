export interface SubscriptionItem {
    name: string;
    url: string;
    channels: string[];
    include?: string[];
    exclude?: string[];
    enabled?: boolean;
}
export interface Config {
    downloader: 'builtin-aria2' | 'torrent-stream';
    aria2CustomPath?: string;
    stalledTimeout: number;
    checkInterval: number;
    downloadTimeout: number;
    videoSizeThreshold: number;
    storagePath: string;
    autoClean: boolean;
    cleanDelay: number;
    uploadTimeout: number;
    serverHost?: string;
    serverPort?: number;
    subscriptions: SubscriptionItem[];
}
export interface RssAnimeSubscription {
    id: number;
    name: string;
    url: string;
    platform: string;
    guildId?: string;
    channelId: string;
    include?: string[];
    exclude?: string[];
    enabled: boolean;
    createdAt: Date;
}
export interface RssAnimeHistory {
    id: number;
    subKey: string;
    guid: string;
    title: string;
    torrentHash?: string;
    fileSize?: number;
    pushedAt: Date;
}
export interface RssFeedItem {
    title: string;
    link: string;
    guid: string;
    pubDate?: string;
    torrentUrl?: string;
    magnetUrl?: string;
    infoHash?: string;
    fileSize?: number;
}
export interface DownloadResult {
    filePath: string;
    fileName: string;
    fileSize: number;
    infoHash: string;
}
