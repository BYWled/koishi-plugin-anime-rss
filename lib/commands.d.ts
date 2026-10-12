import { Context } from 'koishi';
import { Config } from './types';
import { TrackerManager } from './tracker';
export declare function registerCommands(ctx: Context, config: Config, triggerCheck: (channelId?: string, options?: {
    maxItems?: number;
}) => Promise<string>, trackerManager?: TrackerManager): void;
