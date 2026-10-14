var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_fs4 = __toESM(require("fs"));
var import_path4 = __toESM(require("path"));
var import_koishi3 = require("koishi");

// src/database.ts
function initDatabase(ctx) {
  ctx.model.extend("rss_anime_subscription", {
    id: "unsigned",
    name: "string",
    url: "string",
    platform: "string",
    guildId: "string",
    channelId: "string",
    include: "list",
    exclude: "list",
    enabled: { type: "boolean", initial: true },
    createdAt: "timestamp"
  }, {
    primary: "id",
    autoInc: true
  });
  ctx.model.extend("rss_anime_history", {
    id: "unsigned",
    subKey: "string",
    guid: "string",
    title: "string",
    torrentHash: "string",
    fileSize: "integer",
    pushedAt: "timestamp"
  }, {
    primary: "id",
    autoInc: true
  });
}
__name(initDatabase, "initDatabase");
async function getDatabaseSubscriptions(ctx, channelId) {
  if (channelId) {
    return ctx.database.get("rss_anime_subscription", { channelId });
  }
  return ctx.database.get("rss_anime_subscription", {});
}
__name(getDatabaseSubscriptions, "getDatabaseSubscriptions");
async function addDatabaseSubscription(ctx, sub) {
  return ctx.database.create("rss_anime_subscription", {
    ...sub,
    createdAt: /* @__PURE__ */ new Date()
  });
}
__name(addDatabaseSubscription, "addDatabaseSubscription");
async function removeDatabaseSubscription(ctx, id, channelId) {
  const query = { id };
  if (channelId) {
    query.channelId = channelId;
  }
  const records = await ctx.database.get("rss_anime_subscription", query);
  if (!records.length) return false;
  await ctx.database.remove("rss_anime_subscription", query);
  return true;
}
__name(removeDatabaseSubscription, "removeDatabaseSubscription");
async function isItemPushed(ctx, guid, infoHash) {
  const byGuid = await ctx.database.get("rss_anime_history", { guid });
  if (byGuid.length > 0) return true;
  if (infoHash) {
    const byHash = await ctx.database.get("rss_anime_history", { torrentHash: infoHash.toLowerCase() });
    if (byHash.length > 0) return true;
  }
  return false;
}
__name(isItemPushed, "isItemPushed");
async function recordPushedItem(ctx, item) {
  return ctx.database.create("rss_anime_history", {
    ...item,
    torrentHash: item.torrentHash ? item.torrentHash.toLowerCase() : void 0,
    pushedAt: /* @__PURE__ */ new Date()
  });
}
__name(recordPushedItem, "recordPushedItem");

// src/rss.ts
var import_fast_xml_parser = require("fast-xml-parser");
var parser = new import_fast_xml_parser.XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  cdataPropName: "__cdata"
});
function getText(val) {
  if (val === void 0 || val === null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    if (val.__cdata !== void 0) return String(val.__cdata).trim();
    if (val["#text"] !== void 0) return String(val["#text"]).trim();
  }
  return "";
}
__name(getText, "getText");
function matchesFilter(title, include, exclude) {
  const lowerTitle = title.toLowerCase();
  if (include && include.length > 0) {
    const hasAnyInclude = include.some((kw) => {
      const k = kw.trim().toLowerCase();
      return k.length > 0 && lowerTitle.includes(k);
    });
    if (!hasAnyInclude) return false;
  }
  if (exclude && exclude.length > 0) {
    const hasAnyExclude = exclude.some((kw) => {
      const k = kw.trim().toLowerCase();
      return k.length > 0 && lowerTitle.includes(k);
    });
    if (hasAnyExclude) return false;
  }
  return true;
}
__name(matchesFilter, "matchesFilter");
function parseRssXml(xmlContent) {
  const parsed = parser.parse(xmlContent);
  const itemsRaw = parsed?.rss?.channel?.item || parsed?.feed?.entry || parsed?.["rdf:RDF"]?.item || [];
  const itemArray = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];
  const results = [];
  for (const raw of itemArray) {
    if (!raw) continue;
    const title = getText(raw.title);
    if (!title) continue;
    const link = getText(raw.link) || raw.link?.["@_href"] || "";
    const guid = getText(raw.guid) || link || title;
    const pubDate = getText(raw.pubDate) || getText(raw.updated);
    let torrentUrl = raw.enclosure?.["@_url"] || "";
    let fileSize;
    if (raw.enclosure?.["@_length"]) {
      const parsedLen = parseInt(raw.enclosure["@_length"], 10);
      if (!isNaN(parsedLen)) fileSize = parsedLen;
    }
    let infoHash;
    let magnetUrl;
    if (link.startsWith("magnet:?")) {
      magnetUrl = link;
    } else if (torrentUrl.startsWith("magnet:?")) {
      magnetUrl = torrentUrl;
      torrentUrl = "";
    }
    const searchTarget = `${magnetUrl || ""} ${torrentUrl} ${link} ${guid}`;
    const btihMatch = searchTarget.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    if (btihMatch) {
      infoHash = btihMatch[1].toLowerCase();
    } else {
      const hashParamMatch = searchTarget.match(/hash=([a-fA-F0-9]{40})/i);
      if (hashParamMatch) {
        infoHash = hashParamMatch[1].toLowerCase();
      } else {
        const hex40Match = searchTarget.match(/(?:show-|download\/|[a-fA-F0-9]{40})([a-fA-F0-9]{40})/i);
        if (hex40Match) {
          infoHash = (hex40Match[1] || hex40Match[0]).toLowerCase();
        }
      }
    }
    if (!magnetUrl && infoHash) {
      magnetUrl = `magnet:?xt=urn:btih:${infoHash}`;
    }
    results.push({
      title,
      link,
      guid,
      pubDate,
      torrentUrl: torrentUrl || void 0,
      magnetUrl: magnetUrl || void 0,
      infoHash,
      fileSize
    });
  }
  return results;
}
__name(parseRssXml, "parseRssXml");
async function fetchAndParseRss(ctx, url, filter) {
  let xml;
  try {
    xml = await ctx.http.get(url, {
      responseType: "text",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*"
      },
      timeout: 3e4
    });
  } catch (httpErr) {
    xml = await new Promise((resolve, reject) => {
      const https = require("https");
      https.get(
        url,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "*/*"
          }
        },
        (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
          let data = "";
          res.on("data", (c) => data += c);
          res.on("end", () => resolve(data));
        }
      ).on("error", reject);
    });
  }
  const allItems = parseRssXml(xml);
  if (!filter || !filter.include?.length && !filter.exclude?.length) {
    return allItems;
  }
  return allItems.filter(
    (item) => matchesFilter(item.title, filter.include, filter.exclude)
  );
}
__name(fetchAndParseRss, "fetchAndParseRss");

// src/downloader.ts
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_child_process = require("child_process");
var import_torrent_stream = __toESM(require("torrent-stream"));

// src/tracker.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_koishi = require("koishi");
var DEFAULT_FALLBACK_TRACKERS = [
  // 核心动漫与二次元高可用 Tracker（已实测连通）
  "http://nyaa.tracker.wf:7777/announce",
  "udp://tracker4.itzmx.com:2710/announce",
  "http://tracker4.itzmx.com:2710/announce",
  "http://share.camoe.cn:8080/announce",
  "https://tracker.nanoha.org:443/announce",
  "https://tracker.lilithraws.org:443/announce",
  "udp://tracker.mywaifu.best:6969/announce",
  "https://tr.ready4.icu:443/announce",
  "https://tracker.tamersunion.org:443/announce",
  // 高穿透性 HTTP/HTTPS Tracker（免疫国内运营商 UDP QoS 拦截）
  "https://t.213891.xyz:443/announce",
  "https://tracker.foreverpirates.co:443/announce",
  "http://1337.abcvg.info:80/announce",
  "http://bt1.archive.org:6969/announce",
  "http://bt2.archive.org:6969/announce",
  "http://tracker.dler.org:6969/announce",
  "http://tracker.renfei.net:8080/announce",
  "https://tr.burnabyhighstar.com:443/announce",
  "http://tracker.ipv6tracker.ru:80/announce",
  // 全网顶级高活跃 UDP Tracker
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.moeking.me:6969/announce",
  "udp://p4p.arenabg.com:1337/announce",
  "udp://tracker.bittor.pw:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://explodie.org:6969/announce",
  "udp://retracker.lanta-net.ru:2710/announce",
  "udp://tracker.altrosky.nl:6969/announce",
  "udp://tracker.filemail.com:6969/announce",
  "udp://tracker0.ufibox.com:6969/announce",
  "udp://tracker.theoks.net:6969/announce",
  "udp://tracker.srv00.com:6969/announce",
  "udp://wepawet.cz:6969/announce",
  "udp://vibe.rip:6969/announce",
  "udp://valakas.online:6969/announce",
  "udp://tc.animereactor.ru:8082/announce",
  "udp://new-line.net:6969/announce",
  // 备用国内历史源
  "http://open.acgtracker.com:1096/announce",
  "http://t.acg.rip:6699/announce"
];
var TRACKER_MIRROR_SOURCES = [
  "https://cf.trackerslist.com/best_aria2.txt",
  "https://trackerslist.com/best_aria2.txt",
  "https://cf.trackerslist.com/http_aria2.txt",
  "https://fastly.jsdelivr.net/gh/XIU2/TrackersListCollection@master/best_aria2.txt",
  "https://cdn.jsdelivr.net/gh/DeSireFire/animeTrackerList/ATaria2_best.txt",
  "https://ngosang.github.io/trackerslist/trackers_best.txt"
];
var DHT_BOOTSTRAP_NODES = [
  "dht.transmissionbt.com:6881",
  "dht.libtorrent.org:25401",
  "router.bittorrent.com:6881",
  "router.utorrent.com:6881",
  "dht.aelitis.com:6881"
];
var TrackerManager = class _TrackerManager {
  static {
    __name(this, "TrackerManager");
  }
  inMemoryTrackers = new Set(DEFAULT_FALLBACK_TRACKERS);
  cacheFilePath;
  dhtFilePath;
  dht6FilePath;
  logger = new import_koishi.Logger("[anime-rss]");
  lastSyncTime = 0;
  constructor(baseDir) {
    const dataDir = import_path.default.resolve(baseDir, "data/anime-rss");
    import_fs.default.mkdirSync(dataDir, { recursive: true });
    this.cacheFilePath = import_path.default.join(dataDir, "trackers.txt");
    this.dhtFilePath = import_path.default.join(dataDir, "dht.dat");
    this.dht6FilePath = import_path.default.join(dataDir, "dht6.dat");
    this.loadFromCache();
  }
  getDhtFilePath() {
    return this.dhtFilePath;
  }
  getDht6FilePath() {
    return this.dht6FilePath;
  }
  /**
   * 从本地缓存加载 Tracker
   */
  loadFromCache() {
    try {
      if (import_fs.default.existsSync(this.cacheFilePath)) {
        const content = import_fs.default.readFileSync(this.cacheFilePath, "utf8");
        const items = this.parseTrackerString(content);
        if (items.length > 0) {
          items.forEach((t) => this.inMemoryTrackers.add(t));
          const stat = import_fs.default.statSync(this.cacheFilePath);
          this.lastSyncTime = stat.mtimeMs;
        }
      }
    } catch {
    }
  }
  /**
   * 判断某个 URL 是否为 Tracker 订阅列表链接（如 .txt 结尾或订阅源）
   */
  static isSubscriptionUrl(url) {
    const trimmed = url.trim().toLowerCase();
    return (trimmed.startsWith("http://") || trimmed.startsWith("https://")) && (trimmed.endsWith(".txt") || trimmed.includes(".txt?"));
  }
  /**
   * 解析 Tracker 文本（兼容逗号分割与换行分割，并自动过滤非法行与订阅文件路径）
   */
  parseTrackerString(content) {
    return content.split(/[,\r\n]+/).map((s) => s.trim()).filter((s) => {
      if (!s) return false;
      if (s.endsWith(".txt") || s.includes(".txt?")) return false;
      return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("udp://") || s.startsWith("wss://");
    });
  }
  /**
   * 同步在线优质 Tracker 列表（支持 Koishi ctx.http 代理穿透与自定义订阅源扩展）
   */
  async syncTrackers(ctx, force = false, extraSources = []) {
    const now = Date.now();
    if (!force && this.lastSyncTime > 0 && now - this.lastSyncTime < 12 * 3600 * 1e3) {
      return this.inMemoryTrackers.size;
    }
    const fetchedSet = /* @__PURE__ */ new Set();
    const validExtra = extraSources.filter((s) => _TrackerManager.isSubscriptionUrl(s));
    const allSources = Array.from(/* @__PURE__ */ new Set([...TRACKER_MIRROR_SOURCES, ...validExtra]));
    for (const url of allSources) {
      try {
        let text = "";
        if (ctx?.http) {
          text = await ctx.http.get(url, {
            responseType: "text",
            timeout: 6e3,
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; anime-rss/1.0.0; +https://github.com/BYWled/koishi-plugin-anime-rss)"
            }
          });
        } else {
          const res = await fetch(url, { signal: AbortSignal.timeout(6e3) });
          if (res.ok) {
            text = await res.text();
          }
        }
        if (text) {
          const trackers = this.parseTrackerString(text);
          for (const t of trackers) {
            fetchedSet.add(t);
          }
        }
      } catch {
      }
    }
    if (fetchedSet.size > 0) {
      fetchedSet.forEach((t) => this.inMemoryTrackers.add(t));
      this.lastSyncTime = now;
      try {
        const content = Array.from(this.inMemoryTrackers).join("\n");
        import_fs.default.writeFileSync(this.cacheFilePath, content, "utf8");
        this.logger.info(`[tracker] 成功同步 ${fetchedSet.size} 个在线活跃 Tracker，当前池中可用 Tracker 总数: ${this.inMemoryTrackers.size}`);
      } catch (err) {
        this.logger.warn(`[tracker] 写入缓存文件失败: ${err.message}`);
      }
    } else {
      this.logger.info(`[tracker] 暂未获取到新在线源，继续使用当前缓存与内置 Tracker (${this.inMemoryTrackers.size} 个)`);
    }
    return this.inMemoryTrackers.size;
  }
  /**
   * 获取合并后的完整可用 Tracker 列表（支持用户自定义追加，自动识别并过滤 .txt 订阅链接）
   */
  getTrackers(customTrackers = []) {
    const combined = new Set(this.inMemoryTrackers);
    for (const t of customTrackers) {
      const trimmed = t.trim();
      if (_TrackerManager.isSubscriptionUrl(trimmed)) {
        continue;
      }
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("udp://") || trimmed.startsWith("wss://")) {
        combined.add(trimmed);
      }
    }
    return Array.from(combined);
  }
  /**
   * 将高可用 Tracker 列表直接注入到 Magnet 链接中，形成自洽磁力链接
   * 大幅加速初始做种探测与 DHT 元数据下载
   */
  injectTrackersIntoMagnet(magnetUrl, maxTrackers = 50) {
    if (!magnetUrl.startsWith("magnet:?")) return magnetUrl;
    const trackers = this.getTrackers();
    const selected = trackers.slice(0, maxTrackers);
    const trParams = selected.map((t) => `tr=${encodeURIComponent(t)}`).join("&");
    return magnetUrl.includes("?") ? `${magnetUrl}&${trParams}` : `${magnetUrl}?${trParams}`;
  }
};

// src/downloader.ts
var VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".ts", ".flv", ".webm", ".mov"];
function isVideoFile(fileName) {
  const ext = import_path2.default.extname(fileName).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}
__name(isVideoFile, "isVideoFile");
function findVideoFileRecursive(dir) {
  if (!import_fs2.default.existsSync(dir)) return null;
  const entries = import_fs2.default.readdirSync(dir, { withFileTypes: true });
  let candidate = null;
  for (const entry of entries) {
    const fullPath = import_path2.default.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = findVideoFileRecursive(fullPath);
      if (sub && (!candidate || sub.size > candidate.size)) {
        candidate = sub;
      }
    } else if (entry.isFile()) {
      if (isVideoFile(entry.name) && !entry.name.endsWith(".aria2")) {
        const stat = import_fs2.default.statSync(fullPath);
        if (!candidate || stat.size > candidate.size) {
          candidate = { filePath: fullPath, fileName: entry.name, size: stat.size };
        }
      }
    }
  }
  return candidate;
}
__name(findVideoFileRecursive, "findVideoFileRecursive");
function resolveAria2Binary(customPath) {
  if (customPath && import_fs2.default.existsSync(customPath)) {
    return customPath;
  }
  const bundledExe = import_path2.default.resolve(__dirname, "../bin/aria2c.exe");
  if (import_fs2.default.existsSync(bundledExe)) {
    return bundledExe;
  }
  const bundledBin = import_path2.default.resolve(__dirname, "../bin/aria2c");
  if (import_fs2.default.existsSync(bundledBin)) {
    return bundledBin;
  }
  try {
    const { execSync } = require("child_process");
    const cmd = process.platform === "win32" ? "where.exe aria2c" : "which aria2c";
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && import_fs2.default.existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
  }
  return null;
}
__name(resolveAria2Binary, "resolveAria2Binary");
var DownloaderQueue = class {
  static {
    __name(this, "DownloaderQueue");
  }
  queue = [];
  isProcessing = false;
  runExclusive(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }
  async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    this.isProcessing = true;
    const current = this.queue.shift();
    try {
      const result = await current.fn();
      current.resolve(result);
    } catch (err) {
      current.reject(err);
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }
  get pending() {
    return this.queue.length;
  }
  get busy() {
    return this.isProcessing;
  }
};
async function downloadViaAria2(aria2Bin, source, outputDir, timeoutMs = 30 * 60 * 1e3, httpGetter, stalledTimeoutMs = 120 * 1e3, onProgress, trackerManager, customTrackers = [], listenPort = "51413-51425,6881-6999,16881-16899") {
  const taskId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const taskDir = import_path2.default.join(outputDir, taskId);
  await import_fs2.default.promises.mkdir(taskDir, { recursive: true });
  let targetArg = "";
  let torrentFilePath = "";
  if (source.torrentUrl) {
    if (httpGetter) {
      try {
        const arrayBuf = await httpGetter(source.torrentUrl);
        if (arrayBuf && arrayBuf.byteLength > 50) {
          const firstByte = new Uint8Array(arrayBuf)[0];
          if (firstByte === 100) {
            torrentFilePath = import_path2.default.join(taskDir, "source.torrent");
            await import_fs2.default.promises.writeFile(torrentFilePath, Buffer.from(arrayBuf));
            targetArg = torrentFilePath;
          }
        }
      } catch {
      }
    }
  }
  if (!targetArg) {
    const rawMagnet = source.magnetUrl || (source.infoHash ? `magnet:?xt=urn:btih:${source.infoHash}` : "");
    if (rawMagnet) {
      targetArg = trackerManager ? trackerManager.injectTrackersIntoMagnet(rawMagnet) : rawMagnet;
    } else if (source.torrentUrl) {
      targetArg = source.torrentUrl;
    } else {
      throw new Error("No valid torrent URL, magnet, or infoHash provided for aria2");
    }
  }
  const activeTrackers = trackerManager ? trackerManager.getTrackers(customTrackers) : DEFAULT_FALLBACK_TRACKERS.concat(customTrackers);
  const trackerArg = activeTrackers.join(",");
  const effectiveListenPort = listenPort.includes(",") ? listenPort : `${listenPort},6881-6999,16881-16899`;
  const args = [
    "--seed-time=0",
    "--summary-interval=5",
    "--file-allocation=none",
    "--check-certificate=false",
    // 允许连接无系统根证书或自签名的 HTTPS Trackers，避免 Windows 环境 TLS 握手失败
    "--bt-force-encryption=true",
    // 强制混淆握手与加密传输（防国内运营商 DPI 深度包检测阻断，同时兼容强制加密的海外做种者）
    `--listen-port=${effectiveListenPort}`,
    // 规避国内运营商对 BT 默认端口的阻断与 QoS 限速，同时具备多段动态容灾
    `--dht-listen-port=${effectiveListenPort}`,
    "--peer-id-prefix=-qB4630-",
    "--peer-agent=qBittorrent/4.6.3",
    // 伪装 BEP 10 扩展握手 Client Agent，避免被海外做种者或防吸血策略 Choke
    "--user-agent=qBittorrent/4.6.3",
    "--enable-peer-exchange=true",
    "--enable-dht=true",
    "--enable-dht6=false",
    // 国内多数环境未开通 IPv6 或 IPv6 UDP 黑洞，优先专注 IPv4 DHT 避免超时挂起
    "--bt-enable-lpd=true",
    // 开启本地对等发现（Local Peer Discovery）
    "--bt-max-peers=128",
    "--bt-request-peer-speed-limit=10M",
    // 低速时积极扩大并发向所有已连接 Peer/Seed 索取分片，大幅改善初始连接做种者速度
    "--max-connection-per-server=16",
    "--split=16",
    "--min-split-size=1M",
    "--max-upload-limit=2M",
    // 增加连接握手超时，适应国内跨境网络高丢包高延迟环境
    "--bt-tracker-connect-timeout=10",
    "--bt-tracker-timeout=10",
    "--bt-tracker-interval=120",
    // 每 120 秒重新向所有 Tracker 汇报以快速捕获新入网做种者
    "--bt-save-metadata=true",
    "--bt-load-saved-metadata=true",
    "--bt-prioritize-piece=head,tail"
  ];
  if (trackerManager) {
    args.push(`--dht-file-path=${trackerManager.getDhtFilePath()}`);
    args.push(`--dht-file-path6=${trackerManager.getDht6FilePath()}`);
  }
  for (const node of DHT_BOOTSTRAP_NODES) {
    args.push(`--dht-entry-point=${node}`);
  }
  args.push("--bt-exclude-tracker=*");
  args.push(`--bt-tracker=${trackerArg}`);
  args.push("--follow-torrent=mem");
  args.push(`--dir=${taskDir}`);
  args.push(targetArg);
  return new Promise((resolve, reject) => {
    let finished = false;
    const child = (0, import_child_process.spawn)(aria2Bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let lastLogTime = 0;
    let zeroSpeedStart = Date.now();
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill();
        import_fs2.default.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {
        });
        reject(new Error(`Aria2 download timed out after ${Math.round(timeoutMs / 1e3)}s`));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes("[#") && line.includes("%")) {
          const now = Date.now();
          const match = line.match(/\[#\w+\s+([^\/]+)\/([^\(]+)\(([^\)]+)\)\s+CN:(\d+)\s+SD:(\d+)\s+DL:([^\]]+)\]/);
          if (match) {
            const [, downloaded, total, percent, cn, sd, dl] = match;
            const seeders = parseInt(sd, 10);
            const speedIsZero = dl.trim().startsWith("0B");
            if (seeders === 0 && speedIsZero) {
              if (now - zeroSpeedStart >= stalledTimeoutMs) {
                if (!finished) {
                  finished = true;
                  clearTimeout(timer);
                  child.kill();
                  import_fs2.default.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {
                  });
                  return reject(new Error(`当前资源暂无活跃做种者(SD:0)，已在搜寻 ${Math.round(stalledTimeoutMs / 1e3)} 秒后自动跳过下载`));
                }
              }
            } else {
              zeroSpeedStart = now;
            }
            if (now - lastLogTime >= 15e3) {
              lastLogTime = now;
              const prettyLog = `进度: ${percent} (${downloaded.trim()}/${total.trim()}) | 速度: ${dl.trim()} | 连接节点: ${cn} | 做种者: ${sd}`;
              onProgress?.(prettyLog);
            }
          }
        }
      }
    });
    child.stderr.on("data", () => {
    });
    child.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        import_fs2.default.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {
        });
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        if (code !== 0) {
          import_fs2.default.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {
          });
          return reject(new Error(`Aria2 exited with non-zero exit code: ${code}`));
        }
        const video = findVideoFileRecursive(taskDir);
        if (!video) {
          import_fs2.default.promises.rm(taskDir, { recursive: true, force: true }).catch(() => {
          });
          return reject(new Error("Aria2 download completed but no video file was found"));
        }
        resolve({
          filePath: video.filePath,
          fileName: video.fileName,
          fileSize: video.size,
          infoHash: source.infoHash || ""
        });
      }
    });
  });
}
__name(downloadViaAria2, "downloadViaAria2");
async function downloadViaTorrentStream(source, outputDir, timeoutMs = 30 * 60 * 1e3, httpGetter, trackerManager, customTrackers = []) {
  await import_fs2.default.promises.mkdir(outputDir, { recursive: true });
  let torrentTarget;
  if (source.torrentUrl && httpGetter) {
    try {
      const arrayBuf = await httpGetter(source.torrentUrl);
      torrentTarget = Buffer.from(arrayBuf);
    } catch {
      if (source.magnetUrl) {
        torrentTarget = source.magnetUrl;
      } else {
        throw new Error(`Failed to fetch torrent file from ${source.torrentUrl}`);
      }
    }
  } else if (source.magnetUrl) {
    torrentTarget = source.magnetUrl;
  } else if (source.infoHash) {
    torrentTarget = `magnet:?xt=urn:btih:${source.infoHash}`;
  } else {
    throw new Error("No valid torrent URL, magnet, or infoHash provided for download");
  }
  const trackers = trackerManager ? trackerManager.getTrackers(customTrackers) : DEFAULT_FALLBACK_TRACKERS.concat(customTrackers);
  return new Promise((resolve, reject) => {
    let finished = false;
    let engine = null;
    let writeStream = null;
    let targetFilePath = "";
    const cleanup = /* @__PURE__ */ __name(() => {
      if (engine) {
        try {
          engine.destroy();
        } catch {
        }
        engine = null;
      }
    }, "cleanup");
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        if (writeStream) {
          writeStream.destroy();
        }
        cleanup();
        if (targetFilePath && import_fs2.default.existsSync(targetFilePath)) {
          import_fs2.default.promises.unlink(targetFilePath).catch(() => {
          });
        }
        reject(new Error(`Download timed out after ${Math.round(timeoutMs / 1e3)}s`));
      }
    }, timeoutMs);
    try {
      engine = (0, import_torrent_stream.default)(torrentTarget, {
        path: outputDir,
        connections: 80,
        trackers
      });
      engine.on("error", (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          cleanup();
          reject(err);
        }
      });
      engine.on("ready", () => {
        const files = engine.files || [];
        const candidates = files.filter((f) => isVideoFile(f.name));
        if (candidates.length === 0) {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            cleanup();
            reject(new Error("No video file found in torrent content"));
          }
          return;
        }
        candidates.sort((a, b) => b.length - a.length);
        const chosenFile = candidates[0];
        for (const f of files) {
          if (f !== chosenFile && typeof f.deselect === "function") {
            f.deselect();
          }
        }
        if (typeof chosenFile.select === "function") {
          chosenFile.select();
        }
        const safeFileName = chosenFile.name.replace(/[\\/:*?"<>|]/g, "_");
        targetFilePath = import_path2.default.join(outputDir, `${Date.now()}_${safeFileName}`);
        writeStream = import_fs2.default.createWriteStream(targetFilePath);
        const readStream = chosenFile.createReadStream();
        readStream.on("error", (err) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            writeStream?.destroy();
            cleanup();
            if (import_fs2.default.existsSync(targetFilePath)) {
              import_fs2.default.promises.unlink(targetFilePath).catch(() => {
              });
            }
            reject(err);
          }
        });
        writeStream.on("error", (err) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            cleanup();
            if (import_fs2.default.existsSync(targetFilePath)) {
              import_fs2.default.promises.unlink(targetFilePath).catch(() => {
              });
            }
            reject(err);
          }
        });
        writeStream.on("finish", async () => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            cleanup();
            try {
              const stat = await import_fs2.default.promises.stat(targetFilePath);
              resolve({
                filePath: targetFilePath,
                fileName: chosenFile.name,
                fileSize: stat.size,
                infoHash: engine?.infoHash || source.infoHash || ""
              });
            } catch (err) {
              reject(err);
            }
          }
        });
        readStream.pipe(writeStream);
      });
    } catch (err) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    }
  });
}
__name(downloadViaTorrentStream, "downloadViaTorrentStream");
async function downloadTorrentItem(source, outputDir, timeoutMs = 30 * 60 * 1e3, httpGetter, customAria2Path, forceEngine, stalledTimeoutMs = 120 * 1e3, onProgress, trackerManager, customTrackers = [], listenPort = "51413-51425,6881-6999,16881-16899") {
  const aria2Bin = resolveAria2Binary(customAria2Path);
  if (forceEngine === "torrent-stream" || !aria2Bin) {
    return downloadViaTorrentStream(
      source,
      outputDir,
      timeoutMs,
      httpGetter,
      trackerManager,
      customTrackers
    );
  }
  return downloadViaAria2(
    aria2Bin,
    source,
    outputDir,
    timeoutMs,
    httpGetter,
    stalledTimeoutMs,
    onProgress,
    trackerManager,
    customTrackers,
    listenPort
  );
}
__name(downloadTorrentItem, "downloadTorrentItem");

// src/sender.ts
var import_fs3 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var import_http = __toESM(require("http"));
var import_os = __toESM(require("os"));
var import_crypto = __toESM(require("crypto"));
var import_url = require("url");
var import_koishi2 = require("koishi");
function getLocalIpForRemote(remoteHost) {
  if (["127.0.0.1", "localhost", "::1"].includes(remoteHost)) {
    return "127.0.0.1";
  }
  const interfaces = import_os.default.networkInterfaces();
  const remoteParts = remoteHost.split(".").slice(0, 3).join(".");
  for (const name2 of Object.keys(interfaces)) {
    for (const net of interfaces[name2] || []) {
      if (net.family === "IPv4" && !net.internal) {
        if (net.address.split(".").slice(0, 3).join(".") === remoteParts) {
          return net.address;
        }
      }
    }
  }
  for (const name2 of Object.keys(interfaces)) {
    for (const net of interfaces[name2] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}
__name(getLocalIpForRemote, "getLocalIpForRemote");
function parseHostAndPort(rawHost, rawPort = 0) {
  if (!rawHost) return { host: "", port: rawPort };
  let cleaned = rawHost.trim();
  cleaned = cleaned.replace(/^[a-zA-Z]+:\/\//, "");
  cleaned = cleaned.split("/")[0].trim();
  let port = rawPort;
  if (cleaned.includes(":") && !cleaned.startsWith("[")) {
    const parts = cleaned.split(":");
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      cleaned = parts[0];
      if (port === 0) {
        port = Number(parts[1]);
      }
    }
  }
  return { host: cleaned, port };
}
__name(parseHostAndPort, "parseHostAndPort");
async function createTemporaryFileServer(filePath, preferredHost = "127.0.0.1", preferredPort = 0, logger) {
  const parsed = parseHostAndPort(preferredHost, preferredPort);
  const cleanHost = parsed.host || "127.0.0.1";
  const targetPort = parsed.port;
  const token = import_crypto.default.randomBytes(8).toString("hex");
  const baseName = import_path3.default.basename(filePath);
  const encodedName = encodeURIComponent(baseName);
  const stat = await import_fs3.default.promises.stat(filePath);
  const fileSize = stat.size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
  const server = import_http.default.createServer((req, res) => {
    const reqUrl = req.url || "";
    if (!reqUrl.includes(token)) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": fileSize,
      "Content-Disposition": `attachment; filename="${encodedName}"`,
      "Accept-Ranges": "bytes"
    });
    const stream = import_fs3.default.createReadStream(filePath);
    stream.pipe(res);
    res.on("finish", () => {
      logger?.info?.(
        `[push] Video stream fully transferred to OneBot adapter (${fileSizeMB}MB). Waiting for adapter to finish uploading to QQ group...`
      );
    });
    stream.on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.setTimeout(30 * 60 * 1e3);
  await new Promise((resolve, reject) => {
    server.listen(targetPort, "0.0.0.0", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  const port = addr.port;
  const url = `http://${cleanHost}:${port}/${token}/${encodedName}`;
  return {
    url,
    close: /* @__PURE__ */ __name(() => {
      try {
        server.close();
      } catch {
      }
    }, "close")
  };
}
__name(createTemporaryFileServer, "createTemporaryFileServer");
async function invokeOneBotAction(bot, action, params, timeoutMs = 10 * 60 * 1e3, logger) {
  const socket = bot.adapter?.socket || bot?.socket;
  if (socket && typeof socket.send === "function") {
    const echo = `rss_anime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = /* @__PURE__ */ __name(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (typeof socket.removeEventListener === "function") {
          socket.removeEventListener("message", onMessage);
        } else if (typeof socket.off === "function") {
          socket.off("message", onMessage);
        }
      }, "cleanup");
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timeout with request ${action} after ${Math.round(timeoutMs / 1e3)}s`
          )
        );
      }, timeoutMs);
      const onMessage = /* @__PURE__ */ __name((event) => {
        try {
          const raw = typeof event?.data === "string" ? event.data : event?.data ? event.data.toString() : typeof event === "string" ? event : event?.toString?.();
          if (!raw) return;
          const parsed = JSON.parse(raw);
          if (parsed && String(parsed.echo) === echo) {
            cleanup();
            if (parsed.retcode === 0 || parsed.status === "ok") {
              resolve(parsed.data);
            } else {
              reject(
                new Error(
                  `Error with request ${action}, retcode: ${parsed.retcode}, message: ${parsed.message || parsed.wording || "unknown error"}`
                )
              );
            }
          }
        } catch {
        }
      }, "onMessage");
      if (typeof socket.addEventListener === "function") {
        socket.addEventListener("message", onMessage);
      } else if (typeof socket.on === "function") {
        socket.on("message", onMessage);
      }
      try {
        socket.send(JSON.stringify({ action, params, echo }));
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
  const uploadFn = bot.internal?.[action] || bot.internal?.[action.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  if (typeof uploadFn === "function") {
    return uploadFn.call(bot.internal, params.group_id, params.file, params.name);
  }
  throw new Error(`OneBot action ${action} is not supported on this adapter`);
}
__name(invokeOneBotAction, "invokeOneBotAction");
function extractRemoteHost(bot) {
  try {
    const ep = bot.config?.endpoint;
    if (ep) {
      const parsed = new URL(ep);
      return parsed.hostname;
    }
  } catch {
  }
  return "127.0.0.1";
}
__name(extractRemoteHost, "extractRemoteHost");
async function pushAnimeVideo(bot, options) {
  const {
    channelId,
    filePath,
    title,
    fileName = import_path3.default.basename(filePath),
    magnetUrl,
    videoSizeThresholdMB = 80,
    uploadTimeoutMs = 10 * 60 * 1e3,
    logger,
    serverHost,
    serverPort = 0
  } = options;
  if (!import_fs3.default.existsSync(filePath)) {
    throw new Error(`Target file does not exist: ${filePath}`);
  }
  const stat = await import_fs3.default.promises.stat(filePath);
  const sizeMB = stat.size / (1024 * 1024);
  const absolutePath = import_path3.default.resolve(filePath);
  const fileUrl = (0, import_url.pathToFileURL)(absolutePath).href;
  const cleanTargetId = channelId.includes(":") ? channelId.split(":")[1] : channelId;
  const targetGid = Number(cleanTargetId) || cleanTargetId;
  if (sizeMB <= videoSizeThresholdMB) {
    try {
      logger?.info?.(`[push] Sending video message to ${channelId} (${sizeMB.toFixed(1)}MB)`);
      await bot.sendMessage(channelId, [
        import_koishi2.h.text(`【番剧更新】${title}
`),
        import_koishi2.h.video(fileUrl)
      ]);
      return { success: true, mode: "video" };
    } catch (err) {
      logger?.warn?.(`[push] Failed to send regular video message: ${err?.message}. Attempting group file upload fallback.`);
    }
  }
  const hasUploadGroupFile = typeof bot.internal?.uploadGroupFile === "function" || typeof bot.internal?.upload_group_file === "function" || Boolean(bot.adapter?.socket);
  if (hasUploadGroupFile) {
    const remoteHost = extractRemoteHost(bot);
    const isRemote = !["127.0.0.1", "localhost", "::1"].includes(remoteHost);
    logger?.info?.(
      `[push] Uploading group file to ${cleanTargetId} (${sizeMB.toFixed(1)}MB, remoteHost: ${remoteHost}, timeout: ${Math.round(uploadTimeoutMs / 1e3)}s)`
    );
    if (!isRemote) {
      try {
        await invokeOneBotAction(
          bot,
          "upload_group_file",
          { group_id: targetGid, file: absolutePath, name: fileName },
          uploadTimeoutMs,
          logger
        );
        await bot.sendMessage(
          channelId,
          `【番剧更新】${title}
大小：${sizeMB.toFixed(1)}MB，已成功上传至群文件！`
        );
        return { success: true, mode: "group_file" };
      } catch (localErr) {
        logger?.warn?.(`[push] Direct local file upload failed: ${localErr?.message}, trying streaming HTTP server...`);
      }
    }
    let tempServer = null;
    try {
      const parsedConfig = parseHostAndPort(serverHost, serverPort);
      const localIp = parsedConfig.host || getLocalIpForRemote(remoteHost);
      const effectivePort = parsedConfig.port;
      tempServer = await createTemporaryFileServer(absolutePath, localIp, effectivePort, logger);
      logger?.info?.(`[push] Serving video stream to OneBot adapter at: ${tempServer.url}`);
      await invokeOneBotAction(
        bot,
        "upload_group_file",
        { group_id: targetGid, file: tempServer.url, name: fileName },
        uploadTimeoutMs,
        logger
      );
      await bot.sendMessage(
        channelId,
        `【番剧更新】${title}
大小：${sizeMB.toFixed(1)}MB，已成功上传至群文件！`
      );
      return { success: true, mode: "group_file" };
    } catch (streamErr) {
      logger?.warn?.(`[push] upload_group_file failed: ${streamErr?.message}`);
    } finally {
      setTimeout(() => {
        tempServer?.close();
      }, 5e3);
    }
  }
  try {
    const reason = !hasUploadGroupFile ? `当前适配器不支持直接上传群文件，视频大小（${sizeMB.toFixed(1)}MB）超出群聊直发限制（${videoSizeThresholdMB}MB）` : `视频过大且上传群文件失败`;
    await bot.sendMessage(
      channelId,
      `【番剧更新提醒】${title}
大小：${sizeMB.toFixed(1)}MB
提示：${reason}
${magnetUrl ? `磁力链接：
${magnetUrl}` : "请查看 RSS 订阅源获取下载链接。"}`
    );
    return { success: true, mode: "fallback_magnet" };
  } catch (err) {
    return { success: false, mode: "fallback_magnet", error: err?.message };
  }
}
__name(pushAnimeVideo, "pushAnimeVideo");

// src/commands.ts
function registerCommands(ctx, config, triggerCheck, trackerManager) {
  const cmd = ctx.command("anime-rss", "RSS 番剧订阅与推送管理");
  cmd.action(async ({ session }) => {
    return [
      "📺 === RSS 番剧订阅管理 ===",
      "可用指令：",
      "  anime-rss.add <url> [name]  添加番剧订阅",
      "    -i, --include <kw1,kw2>   仅下载包含特定关键词的内容（逗号分隔）",
      "    -e, --exclude <kw1,kw2>   排除包含特定关键词的内容",
      "  anime-rss.remove <id>       删除指定 ID 的订阅",
      "  anime-rss.list              查看当前群生效的番剧订阅列表",
      "  anime-rss.check             立即执行一次订阅检查与更新探测",
      "  anime-rss.tracker           查看或更新当前 BT Tracker 服务器池"
    ].join("\n");
  });
  cmd.subcommand(".add <url:string> [name:string]", "添加番剧订阅").option("include", "-i <keywords:string> 仅下载包含特定关键词的内容（逗号分隔）").option("exclude", "-e <keywords:string> 排除包含特定关键词的内容").action(async ({ session, options }, url, name2) => {
    if (!session?.channelId) {
      return "请在群聊或频道中使用此指令。";
    }
    if (!url || !url.startsWith("http://") && !url.startsWith("https://")) {
      return "请输入合法的 RSS 链接（以 http:// 或 https:// 开头）。";
    }
    let subName = name2?.trim();
    if (!subName) {
      try {
        const items = await fetchAndParseRss(ctx, url);
        subName = items[0]?.title ? items[0].title.slice(0, 30) : "未命名番剧";
      } catch {
        subName = "新番订阅";
      }
    }
    const includeList = options?.include ? options.include.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const excludeList = options?.exclude ? options.exclude.split(",").map((s) => s.trim()).filter(Boolean) : [];
    try {
      const record = await addDatabaseSubscription(ctx, {
        name: subName,
        url,
        platform: session.platform || "onebot",
        guildId: session.guildId,
        channelId: session.channelId,
        include: includeList,
        exclude: excludeList,
        enabled: true
      });
      let msg = `✅ 订阅成功！
- ID: ${record.id}
- 名称: ${record.name}
- 链接: ${record.url}`;
      if (includeList.length) msg += `
- 包含过滤: ${includeList.join(", ")}`;
      if (excludeList.length) msg += `
- 排除过滤: ${excludeList.join(", ")}`;
      return msg;
    } catch (err) {
      return `❌ 添加订阅失败: ${err?.message}`;
    }
  });
  cmd.subcommand(".remove <id:number>", "删除指定订阅").action(async ({ session }, id) => {
    if (!session?.channelId) {
      return "请在群聊或频道中使用此指令。";
    }
    if (!id) {
      return "请输入要删除的订阅 ID。";
    }
    const success = await removeDatabaseSubscription(ctx, id, session.channelId);
    if (success) {
      return `✅ 已成功删除 ID 为 ${id} 的番剧订阅。`;
    } else {
      return `❌ 未找到 ID 为 ${id} 的当前群订阅，请使用 anime-rss.list 确认。`;
    }
  });
  cmd.subcommand(".list", "查看当前群订阅列表").action(async ({ session }) => {
    if (!session?.channelId) {
      return "请在群聊或频道中使用此指令。";
    }
    const currentChannel = session.channelId;
    const cleanTarget = currentChannel.includes(":") ? currentChannel.split(":")[1] : currentChannel;
    const staticSubs = (config.subscriptions || []).filter((sub) => {
      if (!sub.channels || sub.channels.length === 0) return true;
      return sub.channels.some(
        (c) => c === currentChannel || c === cleanTarget || c.endsWith(`:${cleanTarget}`)
      );
    });
    const dbSubs = await getDatabaseSubscriptions(ctx, currentChannel);
    if (staticSubs.length === 0 && dbSubs.length === 0) {
      return "当前群暂无番剧订阅。使用 `anime-rss.add <url>` 添加订阅！";
    }
    const lines = [`📋 当前群番剧订阅列表（共 ${staticSubs.length + dbSubs.length} 个）：`];
    if (staticSubs.length > 0) {
      lines.push("\n[控制台静态配置]");
      staticSubs.forEach((sub, idx) => {
        lines.push(
          `  • [静态-${idx + 1}] ${sub.name} (${sub.enabled ? "已启用" : "已暂停"})`
        );
        lines.push(`    URL: ${sub.url}`);
        if (sub.include?.length) lines.push(`    包含: ${sub.include.join(", ")}`);
        if (sub.exclude?.length) lines.push(`    排除: ${sub.exclude.join(", ")}`);
      });
    }
    if (dbSubs.length > 0) {
      lines.push("\n[群指令动态订阅]");
      dbSubs.forEach((sub) => {
        lines.push(
          `  • [ID: ${sub.id}] ${sub.name} (${sub.enabled ? "已启用" : "已暂停"})`
        );
        lines.push(`    URL: ${sub.url}`);
        if (sub.include?.length) lines.push(`    包含: ${sub.include.join(", ")}`);
        if (sub.exclude?.length) lines.push(`    排除: ${sub.exclude.join(", ")}`);
      });
    }
    return lines.join("\n");
  });
  cmd.subcommand(".check", "立即触发一次订阅检查（默认仅测试最新的 1 个未推送剧集）").option("all", "-a 检查所有未推送的历史更新").action(async ({ session, options }) => {
    await session?.send("🔍 正在触发 RSS 番剧更新检查，请稍候...");
    try {
      const maxItems = options?.all ? void 0 : 1;
      const summary = await triggerCheck(session?.channelId, { maxItems });
      return summary;
    } catch (err) {
      return `❌ 检查过程发生异常: ${err?.message}`;
    }
  });
  cmd.subcommand(".tracker", "查看或更新当前 BT Tracker 节点池状态").option("update", "-u, --update 立即从国内外多镜像源强制同步最新 Tracker 列表").action(async ({ session, options }) => {
    if (!trackerManager) {
      return "Tracker 管理器未就绪。";
    }
    if (options?.update) {
      await session?.send("📡 正在从全网优质镜像源同步最新 BT Tracker 列表，请稍候...");
      const count = await trackerManager.syncTrackers(ctx, true, config.customTrackers || []);
      return `✅ Tracker 同步完成！当前池中活跃 Tracker 总数：${count} 个（已持久化缓存并就绪）。`;
    }
    const trackers = trackerManager.getTrackers(config.customTrackers || []);
    const sample = trackers.slice(0, 5).join("\n  • ");
    return [
      "📡 === BT Tracker 状态 ===",
      `• 可用 Tracker 节点总数：${trackers.length} 个`,
      "• DHT 持久化路由表：已启用（dht.dat + dht6.dat）",
      "• 多镜像自动同步：" + (config.trackerSync !== false ? "已开启" : "已关闭"),
      "• 提示：使用 `anime-rss.tracker -u` 可立即强制从镜像源刷新最新节点列表。",
      `
[部分优质节点预览]：
  • ${sample}`
    ].join("\n");
  });
}
__name(registerCommands, "registerCommands");

// src/index.ts
var name = "anime-rss";
var inject = {
  required: ["database"],
  optional: ["server-temp"]
};
var Config = import_koishi3.Schema.intersect([
  import_koishi3.Schema.object({
    downloader: import_koishi3.Schema.union(["builtin-aria2", "torrent-stream"]).default("builtin-aria2").description("种子下载引擎：builtin-aria2（内置原生高速 Aria2 原生引擎，推荐）/ torrent-stream（轻量 Node.js 引擎）"),
    aria2CustomPath: import_koishi3.Schema.string().description("自定义 aria2 可执行文件路径（留空则自动使用插件内置的 bin/aria2c 或系统 PATH 中的 aria2c）"),
    listenPort: import_koishi3.Schema.string().default("51413-51425,6881-6999,16881-16899").description("BT 与 DHT 监听端口范围（自带多段回退容灾，规避 Windows 端口排除与国内运营商 QoS 限速）"),
    stalledTimeout: import_koishi3.Schema.number().default(180).description("无做种者(死种)熔断时限（秒）。若在此时间内全网做种数(SD)持续为 0 且无流量，自动跳过并推送备用磁力链接，避免卡死下载队列"),
    downloadTimeout: import_koishi3.Schema.number().default(30).description("单集种子下载超时时间（分钟），超时后自动中止释放")
  }).description("下载引擎设置"),
  import_koishi3.Schema.object({
    trackerSync: import_koishi3.Schema.boolean().default(true).description("是否自动从国内多镜像源（XIU2/TrackersList 等）动态同步最新活跃 BT Tracker 列表（推荐开启，大幅提升做种者连接率与下载速度）"),
    customTrackers: import_koishi3.Schema.array(import_koishi3.Schema.string()).role("table").default([]).description("用户自定义追加的 BT Tracker 地址列表（支持 announce URL，亦支持直接填写 .txt 订阅链接如 https://.../ATaria2_best.txt 自动拉取展开）")
  }).description("Tracker 与 P2P 网络优化"),
  import_koishi3.Schema.object({
    checkInterval: import_koishi3.Schema.number().default(15).description("RSS 订阅源自动轮询间隔（分钟）。设为 0 则不自动轮询，仅通过指令触发"),
    videoSizeThreshold: import_koishi3.Schema.number().default(80).description("普通群视频直发上限（MB）。超出此体积自动转为上传群文件，突破 QQ/OneBot 视频大小限制与画质压缩"),
    uploadTimeout: import_koishi3.Schema.number().default(10).description("群文件上传超时时限（分钟）。解决大文件上传耗时较长被协议端底层默认 60 秒硬超时熔断的问题")
  }).description("推送与轮询设置"),
  import_koishi3.Schema.object({
    storagePath: import_koishi3.Schema.string().default("data/anime-rss/temp").description("临时视频与种子文件下载存储路径（相对工作区）"),
    autoClean: import_koishi3.Schema.boolean().default(true).description("推送成功后是否自动删除本地临时视频与种子缓存（零磁盘积压）"),
    cleanDelay: import_koishi3.Schema.number().default(10).description("推送成功到删除临时文件的缓冲延迟时间（秒）")
  }).description("存储与自动清理"),
  import_koishi3.Schema.object({
    serverHost: import_koishi3.Schema.string().description("跨机/容器协议端回连 IP 或域名（填写纯 IP 或域名如 192.168.1.100，无需加 http://；留空则自动探测与协议端同网段的内网 IP）"),
    serverPort: import_koishi3.Schema.number().default(0).description("文件传输临时 HTTP 服务端口（0 为使用系统随机空闲端口）")
  }).description("跨机与容器协议端网络设置"),
  import_koishi3.Schema.object({
    subscriptions: import_koishi3.Schema.array(
      import_koishi3.Schema.object({
        name: import_koishi3.Schema.string().required().description("番剧订阅名称（例如：罗小黑战记）"),
        url: import_koishi3.Schema.string().required().description("RSS 订阅链接（以 http:// 或 https:// 开头）"),
        channels: import_koishi3.Schema.array(import_koishi3.Schema.string()).role("table").description("推送目标群号或频道（如 123456789 或 onebot:123456789）"),
        include: import_koishi3.Schema.array(import_koishi3.Schema.string()).description("必须包含的过滤关键词（如 1080p, 简日）"),
        exclude: import_koishi3.Schema.array(import_koishi3.Schema.string()).description("排除的过滤关键词（如 720p, 繁体）"),
        enabled: import_koishi3.Schema.boolean().default(true).description("是否启用此订阅")
      })
    ).default([]).description("控制台配置的全局静态订阅列表（界面直观，重启常驻）")
  }).description("全局静态订阅管理")
]);
function apply(ctx, config) {
  const logger = new import_koishi3.Logger("[anime-rss]");
  const downloaderQueue = new DownloaderQueue();
  const trackerManager = new TrackerManager(ctx.baseDir);
  initDatabase(ctx);
  const absoluteStoragePath = import_path4.default.resolve(ctx.baseDir, config.storagePath);
  import_fs4.default.mkdirSync(absoluteStoragePath, { recursive: true });
  if (config.trackerSync !== false) {
    trackerManager.syncTrackers(ctx, false, config.customTrackers || []).catch((err) => {
      logger.warn(`[tracker] 初始同步 Tracker 异常: ${err?.message}`);
    });
    ctx.setInterval(() => {
      if (config.trackerSync !== false) {
        trackerManager.syncTrackers(ctx, false, config.customTrackers || []).catch(() => {
        });
      }
    }, 12 * 3600 * 1e3);
  }
  function resolveBot(platform, channelId) {
    if (channelId && channelId.includes(":")) {
      const p = channelId.split(":")[0];
      const bot = ctx.bots.find((b) => b.platform === p && b.isActive);
      if (bot) return bot;
    }
    if (platform) {
      const bot = ctx.bots.find((b) => b.platform === platform && b.isActive);
      if (bot) return bot;
    }
    return ctx.bots.find((b) => b.isActive) || ctx.bots[0];
  }
  __name(resolveBot, "resolveBot");
  async function runCheckCycle(targetChannelId, options) {
    logger.info("Starting RSS subscription check cycle...");
    const maxItems = options?.maxItems;
    let checkedCount = 0;
    let updatedCount = 0;
    const activeSubs = [];
    for (const s of config.subscriptions || []) {
      if (s.enabled === false) continue;
      activeSubs.push({
        subKey: `static:${s.url}`,
        name: s.name,
        url: s.url,
        channels: s.channels || [],
        include: s.include,
        exclude: s.exclude
      });
    }
    try {
      const dbSubs = await getDatabaseSubscriptions(ctx, targetChannelId);
      for (const d of dbSubs) {
        if (!d.enabled) continue;
        activeSubs.push({
          subKey: `db:${d.id}`,
          name: d.name,
          url: d.url,
          channels: [d.channelId],
          platform: d.platform,
          include: d.include,
          exclude: d.exclude
        });
      }
    } catch (err) {
      logger.error(`Failed to load database subscriptions: ${err?.message}`);
    }
    const currentSubs = targetChannelId ? activeSubs.filter((sub) => {
      const cleanTarget = targetChannelId.includes(":") ? targetChannelId.split(":")[1] : targetChannelId;
      return sub.channels.some(
        (c) => c === targetChannelId || c === cleanTarget || c.endsWith(`:${cleanTarget}`)
      );
    }) : activeSubs;
    for (const sub of currentSubs) {
      checkedCount++;
      try {
        logger.info(`Fetching RSS feed for "${sub.name}": ${sub.url}`);
        const items = await fetchAndParseRss(ctx, sub.url, {
          include: sub.include,
          exclude: sub.exclude
        });
        for (const item of items) {
          const isPushed = await isItemPushed(ctx, item.guid, item.infoHash);
          if (isPushed) continue;
          logger.info(`New anime episode detected: ${item.title}`);
          updatedCount++;
          try {
            const downloadResult = await downloaderQueue.runExclusive(async () => {
              logger.info(`[downloader] Enqueueing download for: ${item.title} (engine: ${config.downloader})`);
              return downloadTorrentItem(
                {
                  torrentUrl: item.torrentUrl,
                  magnetUrl: item.magnetUrl,
                  infoHash: item.infoHash
                },
                absoluteStoragePath,
                config.downloadTimeout * 60 * 1e3,
                async (url) => {
                  return ctx.http.get(url, { responseType: "arraybuffer" });
                },
                config.aria2CustomPath,
                config.downloader,
                (config.stalledTimeout || 180) * 1e3,
                (progressStr) => {
                  logger.info(`[downloader] ${progressStr}`);
                },
                trackerManager,
                config.customTrackers || [],
                config.listenPort || "51413-51425,6881-6999,16881-16899"
              );
            });
            for (const ch of sub.channels) {
              const bot = resolveBot(sub.platform, ch);
              if (!bot) {
                logger.warn(`No online bot found to push anime to channel ${ch}`);
                continue;
              }
              const pushRes = await pushAnimeVideo(bot, {
                channelId: ch,
                filePath: downloadResult.filePath,
                title: item.title,
                fileName: downloadResult.fileName,
                magnetUrl: item.magnetUrl,
                videoSizeThresholdMB: config.videoSizeThreshold,
                uploadTimeoutMs: (config.uploadTimeout || 10) * 60 * 1e3,
                serverHost: config.serverHost,
                serverPort: config.serverPort,
                logger
              });
              logger.info(
                `Pushed "${item.title}" to ${ch} (mode: ${pushRes.mode}, success: ${pushRes.success})`
              );
            }
            await recordPushedItem(ctx, {
              subKey: sub.url,
              guid: item.guid,
              title: item.title,
              torrentHash: item.infoHash,
              fileSize: downloadResult.fileSize
            });
            if (config.autoClean && downloadResult.filePath) {
              setTimeout(async () => {
                try {
                  if (import_fs4.default.existsSync(downloadResult.filePath)) {
                    await import_fs4.default.promises.unlink(downloadResult.filePath);
                    const parentDir = import_path4.default.dirname(downloadResult.filePath);
                    if (parentDir !== absoluteStoragePath && import_fs4.default.existsSync(parentDir)) {
                      await import_fs4.default.promises.rm(parentDir, { recursive: true, force: true }).catch(() => {
                      });
                    }
                    logger.info(`Cleaned up temporary video: ${downloadResult.filePath}`);
                  }
                } catch (cleanErr) {
                  logger.warn(`Failed to clean up temp file: ${cleanErr?.message}`);
                }
              }, config.cleanDelay * 1e3);
            }
          } catch (dlErr) {
            logger.warn(`Download/push ended for "${item.title}": ${dlErr?.message}`);
            const isStalled = String(dlErr?.message).includes("暂无活跃做种者");
            const alertPrefix = isStalled ? "⚠️ 【番剧更新提醒】" : "⚠️ 【番剧下载失败】";
            const alertReason = isStalled ? "该资源全网暂无活跃做种者(做种数: 0)，已转为提供磁力链接供离线下载" : `原因：${dlErr?.message}`;
            for (const ch of sub.channels) {
              const bot = resolveBot(sub.platform, ch);
              if (bot) {
                bot.sendMessage(
                  ch,
                  `${alertPrefix}《${sub.name}》- ${item.title}
${alertReason}
${item.magnetUrl ? `备用磁力链接：
${item.magnetUrl}` : ""}`
                ).catch(() => {
                });
              }
            }
            if (isStalled) {
              await recordPushedItem(ctx, {
                subKey: sub.url,
                guid: item.guid,
                title: item.title,
                torrentHash: item.infoHash,
                fileSize: 0
              }).catch(() => {
              });
            }
          }
          if (maxItems && updatedCount >= maxItems) {
            break;
          }
        }
        if (maxItems && updatedCount >= maxItems) {
          break;
        }
      } catch (feedErr) {
        logger.error(`Error processing feed "${sub.name}" (${sub.url}): ${feedErr?.message}`);
      }
    }
    const summary = `检查完成！已巡检 ${checkedCount} 个订阅源，发现并处理 ${updatedCount} 条更新。`;
    logger.info(summary);
    return summary;
  }
  __name(runCheckCycle, "runCheckCycle");
  registerCommands(ctx, config, (channelId, options) => runCheckCycle(channelId, options), trackerManager);
  if (config.checkInterval > 0) {
    ctx.setInterval(() => {
      runCheckCycle().catch((err) => {
        logger.error(`Scheduled check cycle error: ${err?.message}`);
      });
    }, config.checkInterval * 60 * 1e3);
  }
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
