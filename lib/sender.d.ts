import { Bot, Logger } from 'koishi';
export interface PushOptions {
    channelId: string;
    filePath: string;
    title: string;
    fileName?: string;
    magnetUrl?: string;
    videoSizeThresholdMB?: number;
    uploadTimeoutMs?: number;
    logger?: Logger;
    serverHost?: string;
    serverPort?: number;
}
export interface PushResult {
    success: boolean;
    mode: 'video' | 'group_file' | 'fallback_magnet';
    error?: string;
}
/**
 * Finds the best local IP address matching the remote host's subnet.
 */
export declare function getLocalIpForRemote(remoteHost: string): string;
/**
 * Spawns a lightweight, token-protected temporary HTTP file streaming server.
 * Streams directly from disk with zero memory buffering.
 */
export declare function createTemporaryFileServer(filePath: string, preferredHost?: string, preferredPort?: number, logger?: Logger): Promise<{
    url: string;
    close: () => void;
}>;
/**
 * Invokes a OneBot v11 action with a custom extended timeout (default 10 minutes),
 * bypassing Koishi OneBot adapter's 60s hardcoded timeout for large file uploads.
 */
export declare function invokeOneBotAction(bot: Bot, action: string, params: any, timeoutMs?: number, logger?: Logger): Promise<any>;
export declare function pushAnimeVideo(bot: Bot, options: PushOptions): Promise<PushResult>;
