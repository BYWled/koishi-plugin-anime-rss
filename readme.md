<h1 align="center">koishi-plugin-anime-rss</h1>

<p align="center">
	Koishi 平台的高性能 RSS 番剧订阅与自动推送插件，支持种子流式下载、内存防爆与智能分流群推送。
</p>

<p align="center">
	<a href="https://www.npmjs.com/package/koishi-plugin-anime-rss"><img src="https://img.shields.io/npm/v/koishi-plugin-anime-rss?style=for-the-badge&logo=npm" alt="npm" /></a>
	<a href="https://github.com/BYWled/koishi-plugin-anime-rss"><img src="https://img.shields.io/github/stars/BYWled/koishi-plugin-anime-rss?style=for-the-badge&logo=github" alt="GitHub Stars" /></a>
  <a href="https://github.com/BYWled/koishi-plugin-anime-rss/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
	<a href="https://gitee.com/BYWled/koishi-plugin-anime-rss"><img src="https://img.shields.io/badge/Gitee-代码镜像-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee Mirror" /></a>
	<a href="https://gitcode.com/BYWled/koishi-plugin-anime-rss"><img src="https://img.shields.io/badge/GitCode-代码镜像-2962FF?style=for-the-badge&logo=gitcode&logoColor=white" alt="GitCode Mirror" /></a>
</p>

<p align="center">
	<a href="https://github.com/BYWled/koishi-plugin-anime-rss">GitHub</a> ·
	<a href="https://gitee.com/BYWled/koishi-plugin-anime-rss">Gitee</a> ·
	<a href="https://gitcode.com/BYWled/koishi-plugin-anime-rss">GitCode</a>
</p>

本插件为 Koishi 机器人提供全自动 RSS 番剧订阅、种子高速下载与群推送能力。针对番剧视频文件体积庞大（数百兆至数吉字节）的现实痛点，全流程贯彻零堆内存滞留（Zero-Heap Retention）设计，完美兼容同机与跨机协议端（OneBot/NapCat 等），保障长周期挂机稳定不爆内存。

> 版本：**1.0.0**

## ✨ 特性

- 📡 **双轨订阅管理**：
  - 支持在 Koishi 控制台配置全局静态订阅源，界面直观、重启常驻。
  - 支持群内管理员通过聊天指令动态增删订阅，支持群级别独立订阅管理。
- ⚡ **双驱动高速下载引擎**：
  - **内置 Aria2 原生引擎（推荐）**：插件免配置内置便携式 Aria2 原生下载器，自动注入优质全网热门 BT Tracker，多线程 P2P 并行下载（实测速度达数十兆/秒），彻底告别传统 Node.js 库无流量死种问题。
  - **Node.js 兼容引擎**：内置 `torrent-stream` 轻量级纯 JavaScript 引擎，保障跨架构极致便携。
- 🛡️ **死种智能熔断机制**：
  - 自动检测做种健康度。当种子持续全网做种数（Seeds）为 0 且无流量达到设定时限时，自动跳过并推送备用磁力链接，绝不卡死下载队列。
- 🧠 **严格内存防爆（Zero-Heap 零堆内存滞留）**：
  - 单任务独占队列（Downloader Queue）串行调度，文件写入全流式管道（Stream Pipe）直达硬盘，绝不将视频字节读入 V8 堆内存 Buffer。
  - 杜绝经过 WebSocket 的 Base64 编码膨胀传输（1GB 视频会膨胀至 1.33GB 并击穿 Koishi 与协议端进程）。
- 🚀 **智能分流群推送**：
  - **普通视频消息**：视频大小 $\le$ 阈值（默认 80MB）时，以群原生视频消息发送。
  - **群文件直传**：视频大小 $>$ 阈值时，自动调用 OneBot 原生接口上传至 QQ 群文件，规避 QQ 视频大小限制与画质压缩。
- 🌐 **同机/跨机/Docker 协议端全拓扑直通**：
  - 同机协议端：通过本地绝对路径直传，极速秒级完成。
  - 远端/Docker 协议端：自动探测局域网/ZeroTier/Tailscale 同网段网络拓扑，按需启动临时轻量 HTTP 流式服务端（`0.0.0.0` 动态端口 + 安全 Token），支持长达 10 分钟的大文件上传超时容忍，协议端以 HTTP 流方式安全高速抓取并转入群文件，无需配置繁琐的 Docker 挂载卷。
- 🧹 **即用即删生命周期闭环**：
  - 每次推送完毕后自动释放所有连接句柄，并在延迟倒计时后自动清理本地临时视频与缓存文件，长期挂机零磁盘积压。

## 📦 依赖

本插件需要以下服务：

- `database`：用于存储动态群订阅表与已推送历史防重记录。

## ⚙️ 配置项说明 (Config)

可在 Koishi 控制台插件配置页中进行可视化配置：

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `downloader` | `'builtin-aria2' \| 'torrent-stream'` | `'builtin-aria2'` | 种子下载引擎。默认内置原生高速 Aria2，彻底解决无流量问题。 |
| `aria2CustomPath` | `string` | `''` | 自定义 aria2 可执行文件路径（留空自动使用内置或系统 PATH 中的 aria2c）。 |
| `stalledTimeout` | `number` | `120` | 无做种者(死种)熔断时限（秒）。若在此时间内全网做种数持续为 0 且无流量，自动跳过并推送备用磁力链接。 |
| `checkInterval` | `number` | `15` | RSS 轮询间隔（分钟）。设为 0 则不自动轮询。 |
| `downloadTimeout` | `number` | `30` | 单集种子下载超时时间（分钟），超时后自动中止释放。 |
| `uploadTimeout` | `number` | `10` | 群文件上传超时时限（分钟），解决超大文件上传被协议端默认 60 秒硬超时熔断的问题。 |
| `videoSizeThreshold` | `number` | `80` | 普通群视频直发上限（MB），超出此体积自动转为上传群文件。 |
| `storagePath` | `string` | `'data/anime-rss/temp'` | 临时视频与种子文件的存放目录（工作区相对路径）。 |
| `autoClean` | `boolean` | `true` | 推送完成后是否自动删除本地临时视频与种子缓存。 |
| `cleanDelay` | `number` | `10` | 推送完成到执行删除的缓冲延迟时间（秒）。 |
| `serverHost` | `string` | `''` | 远端协议端获取视频文件时的本机 IP 或域名（留空自动检测同网段内网 IP）。 |
| `serverPort` | `number` | `0` | 文件传输临时 HTTP 服务端口（0 为使用系统随机空闲端口）。 |
| `subscriptions` | `array` | `[]` | 控制台配置的静态全局订阅列表。 |

### 静态订阅项字段：

- `name`：番剧订阅名称（如：`罗小黑战记`）
- `url`：RSS 订阅链接
- `channels`：接收更新的目标群号或频道列表（如 `['123456789']` 或 `['onebot:123456789']`）
- `include`：必须包含的关键词列表（如 `['1080p', '简日']`）
- `exclude`：排除的关键词列表（如 `['720p', '繁体']`）
- `enabled`：是否启用此订阅

## 💬 指令说明 (Commands)

### 用户与群管指令

- **`anime-rss`**
  - 查看插件指令帮助与当前状态。

- **`anime-rss.add <url> [name]`**
  - 为当前群添加一条动态番剧订阅。
  - 参数 `url`：RSS 订阅链接（以 http:// 或 https:// 开头）。
  - 参数 `name`：可选，番剧名称（不填则自动从订阅源解析最新标题）。
  - 选项 `-i, --include <kw1,kw2>`：仅下载包含特定关键词的内容（逗号分隔）。
  - 选项 `-e, --exclude <kw1,kw2>`：排除包含特定关键词的内容（逗号分隔）。

- **`anime-rss.remove <id>`**
  - 删除指定 ID 的动态群订阅。
  - 参数 `id`：订阅 ID（可通过 `anime-rss.list` 查询）。

- **`anime-rss.list`**
  - 查看当前群生效的所有番剧订阅列表（同时汇总展示控制台静态配置与本群动态订阅）。

- **`anime-rss.check`**
  - 立即触发一次订阅检查与更新探测。
  - 默认仅测试最新 1 个未推送剧集，避免测试时全量排队阻塞。
  - 选项 `-a, --all`：全量检查并下载所有未推送的历史更新。

## 📝 更新日志

详细的更新日志请查看 [CHANGELOG.md](./CHANGELOG.md)。

---

**开发者**: BYWled  
**仓库**: `koishi-plugin-anime-rss`

萌新编写，部分借助了AI的力量，若有纰漏，还望海涵QwQ
