import { Context } from 'koishi';
import { RssAnimeSubscription, RssAnimeHistory } from './types';
declare module 'koishi' {
    interface Tables {
        rss_anime_subscription: RssAnimeSubscription;
        rss_anime_history: RssAnimeHistory;
    }
}
export declare function initDatabase(ctx: Context): void;
export declare function getDatabaseSubscriptions(ctx: Context, channelId?: string): Promise<RssAnimeSubscription[]>;
export declare function addDatabaseSubscription(ctx: Context, sub: Omit<RssAnimeSubscription, 'id' | 'createdAt'>): Promise<RssAnimeSubscription>;
export declare function removeDatabaseSubscription(ctx: Context, id: number, channelId?: string): Promise<boolean>;
export declare function isItemPushed(ctx: Context, guid: string, infoHash?: string): Promise<boolean>;
export declare function recordPushedItem(ctx: Context, item: Omit<RssAnimeHistory, 'id' | 'pushedAt'>): Promise<RssAnimeHistory>;
