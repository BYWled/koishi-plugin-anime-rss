import { Context } from 'koishi';
import { Config } from './types';
export declare function registerCommands(ctx: Context, config: Config, triggerCheck: (channelId?: string, options?: {
    maxItems?: number;
}) => Promise<string>): void;
