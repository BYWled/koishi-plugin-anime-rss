import { Context, Schema } from 'koishi';
import { SubscriptionItem } from './types';
export declare const name = "anime-rss";
export declare const inject: {
    required: string[];
    optional: string[];
};
export interface Config {
    downloader: 'builtin-aria2' | 'torrent-stream';
    aria2CustomPath?: string;
    listenPort?: string;
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
    trackerSync?: boolean;
    customTrackers?: string[];
    subscriptions: SubscriptionItem[];
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
