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
 * Asynchronously determines the exact local IP routed by the OS kernel to the remote host.
 */
export declare function getLocalIpForRemoteAsync(remoteHost: string): Promise<string>;
/**
 * Normalizes host strings by stripping protocol schemes (e.g. http://, https://), paths, and trailing slashes.
 * Also extracts port if the user provided host:port.
 */
export declare function parseHostAndPort(rawHost?: string, rawPort?: number): {
    host: string;
    port: number;
};
export declare function sanitizeHost(host: string): string;
/**
 * Spawns a lightweight, token-protected temporary HTTP file streaming server.
 * Streams directly from disk with zero memory buffering. Supports HEAD and Range requests.
 */
export declare function createTemporaryFileServer(filePath: string, preferredHost?: string, preferredPort?: number, logger?: Logger): Promise<{
    url: string;
    close: (force?: boolean) => void;
    isTransferring: () => boolean;
}>;
/**
 * Resolves the underlying WebSocket socket object from Bot or Bot.adapter across all protocol modes (ws, ws-reverse).
 */
export declare function getBotSocket(bot: Bot): any;
/**
 * Invokes a OneBot v11 action with a custom extended timeout (default 10 minutes),
 * bypassing Koishi OneBot adapter's 60s hardcoded timeout for large file uploads.
 */
export declare function invokeOneBotAction(bot: Bot, action: string, params: any, timeoutMs?: number, logger?: Logger): Promise<any>;
export declare function extractRemoteHost(bot: Bot, socket?: any): string;
export declare function pushAnimeVideo(bot: Bot, options: PushOptions): Promise<PushResult>;
