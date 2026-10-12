import { Context } from 'koishi';
/**
 * 经过精选与验证的高可用内置静态备用 Tracker 列表
 * 涵盖国内外顶尖动漫及通用 Tracker（HTTP/HTTPS/UDP 多协议混合，保障穿透性）
 */
export declare const DEFAULT_FALLBACK_TRACKERS: string[];
/**
 * 专为中国大陆网络环境优化的优质 Tracker 在线镜像订阅源（多重 CDN 容灾）
 */
export declare const TRACKER_MIRROR_SOURCES: string[];
/**
 * 高可用 DHT 引导节点（Bootstrap Nodes）
 */
export declare const DHT_BOOTSTRAP_NODES: string[];
export declare class TrackerManager {
    private inMemoryTrackers;
    private cacheFilePath;
    private dhtFilePath;
    private dht6FilePath;
    private logger;
    private lastSyncTime;
    constructor(baseDir: string);
    getDhtFilePath(): string;
    getDht6FilePath(): string;
    /**
     * 从本地缓存加载 Tracker
     */
    private loadFromCache;
    /**
     * 解析 Tracker 文本（兼容逗号分割与换行分割）
     */
    parseTrackerString(content: string): string[];
    /**
     * 同步在线优质 Tracker 列表（支持 Koishi ctx.http 代理穿透）
     */
    syncTrackers(ctx?: Context, force?: boolean): Promise<number>;
    /**
     * 获取合并后的完整可用 Tracker 列表（支持用户自定义追加）
     */
    getTrackers(customTrackers?: string[]): string[];
    /**
     * 将高可用 Tracker 列表直接注入到 Magnet 链接中，形成自洽磁力链接
     * 大幅加速初始做种探测与 DHT 元数据下载
     */
    injectTrackersIntoMagnet(magnetUrl: string, maxTrackers?: number): string;
}
