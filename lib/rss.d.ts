import { Context } from 'koishi';
import { RssFeedItem } from './types';
export declare function matchesFilter(title: string, include?: string[], exclude?: string[]): boolean;
export declare function parseRssXml(xmlContent: string): RssFeedItem[];
export declare function fetchAndParseRss(ctx: Context, url: string, filter?: {
    include?: string[];
    exclude?: string[];
}): Promise<RssFeedItem[]>;
