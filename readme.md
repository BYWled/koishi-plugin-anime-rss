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

本插件为 Koishi 机器人提供全自动 RSS 番剧订阅、种子高速下载与群推送能力。针对番剧视频文件体积庞大（数百兆至数吉字节）以及国内复杂的 BitTorrent 跨境网络环境，全流程贯彻零堆内存滞留（Zero-Heap Retention）设计与深度网络穿透优化，完美兼容同机与跨机协议端（OneBot / NapCat / LLOneBot 等），保障长周期挂机稳定不爆内存。

> 版本：**1.0.1**

---

## ✨ 核心特性

- ⚡ **原生 Aria2 高性能下载引擎**：
  - **免配置开箱即用**：插件免配置内置便携式 Aria2 原生引擎，告别传统 Node.js 库常年无速度死种问题。
  - **规避运营商端口封锁**：默认监听标准安全高位端口段（`51413-51425`），彻底告别国内运营商对 `6881-6999` BT 端口的恶劣封锁与 QoS 丢包。
  - **全流量混淆加密（`--bt-force-encryption=true`）**：强制开启 BitTorrent 握手与数据传输加密，绕过运营商 DPI 深度包检测拦截，并无缝兼容海外强制要求加密连接的优质 Seedbox 做种者。
  - **HTTPS Tracker 证书穿透**：针对 Windows 环境优化，解决便携版下载器因缺少 CA 根证书导致无法连接 HTTPS Tracker 的问题。
  - **完整客户端伪装**：底层握手全面伪装为 `qBittorrent/4.6.3`（含 Client Agent 与 Peer-ID 扩展握手），杜绝被海外做种端反吸血机制误判 Choke。
- 📡 **全网热门 BT Tracker 动态加速池**：
  - 内置精选 60+ 活跃二次元与通用 Tracker（覆盖 ACG.RIP、Nyaa、Camoe、Itzmx、Nanoha、LilithRaws 等）。
  - 支持从国内外 5 大优质 CDN 镜像源定时自动拉取全网最新活跃 Tracker（如 XIU2 / TrackersList），并支持指令强制刷新。
  - 磁力链接自动注入 Tracker 参数，形成自洽高可用链接，加速 DHT 网络寻道与元数据解析。
- 🛡️ **死种智能熔断与磁力降级**：
  - 实时监控做种健康度。当种子持续无活跃做种者（SD: 0）且无下载流量达到设定时限（默认 180 秒）时，自动跳过下载并向群内推送备用磁力链接，绝不卡死下载队列。
- 🧠 **严格内存防爆（Zero-Heap 零堆内存滞留）**：
  - 单任务独占队列（Downloader Queue）串行调度，文件写入全流式管道（Stream Pipe）直达硬盘，绝不将视频字节读入 V8 堆内存 Buffer。
  - 杜绝经过 WebSocket 的 Base64 编码膨胀传输（1GB 视频会膨胀至 1.33GB 并直接击穿 Koishi 与协议端进程）。
- 🚀 **智能分流群推送**：
  - **普通视频消息**：视频大小 $\le$ 阈值（默认 80MB）时，以群原生视频消息发送，手机端无需下载即可内联播放。
  - **群文件直传**：视频大小 $>$ 阈值时，自动调用 OneBot 原生接口上传至 QQ 群文件，突破 QQ 视频体积限制与压缩率。
- 🌐 **同机 / 跨机 / Docker 协议端全拓扑直通**：
  - 同机协议端：通过本地绝对路径直传，极速秒级完成。
  - 远端/Docker 协议端：自动探测局域网/内网同网段 IP，按需启动临时轻量 HTTP 流式服务端（`0.0.0.0` 动态端口 + 安全 Token），支持超长上传超时容忍，协议端以 HTTP 流方式安全高速抓取并转入群文件，无需配置繁琐的 Docker 挂载卷。
- 🧹 **即用即删生命周期闭环**：
  - 每次推送完毕后自动释放所有连接句柄，并在延迟倒计时后自动清理本地临时视频与缓存文件，长期挂机零磁盘积压。

---

## 📦 依赖服务

本插件需要以下服务：

- `database`：用于存储动态群订阅表与已推送历史去重记录（SQLite / MySQL 等均可）。

---

## 📖 从零开始配置与实战教程

### 第一步：获取番剧 RSS 订阅链接

本插件支持各大主流动漫 BT 站点的 RSS 订阅源：

| 动漫发布站 | 订阅地址示例 | 获取方式说明 |
|---|---|---|
| **蜜柑计划 (Mikan Project)** | `https://mikanani.me/RSS/Bangumi?bangumiId=XXXX` | 打开番剧详情页，点击右上角或字幕组旁的 **RSS** 订阅图标即可复制链接。 |
| **爱恋动漫 (KissSub)** | `https://kisssub.org/rss-关键词.xml` | 在搜索框输入番剧名称搜索，点击页面底部的 **RSS 订阅** 按钮。 |
| **动漫花园 (DMHY)** | `https://share.dmhy.org/topics/rss/rss.xml?keyword=关键词` | 搜索番剧名称后，复制地址栏下方提供的 RSS 订阅源。 |
| **ACG.RIP** | `https://acg.rip/users/rss/XXXX` | 在番剧或字幕组发布页面复制 RSS 链接。 |

---

### 第二步：科学配置关键词过滤（避免重复推送）

同一个番剧通常会有多个字幕组同时发布（包含 720p / 1080p / 简日双语 / 繁体内嵌等多种版本）。为防止群内收到重复提醒，建议合理利用 **包含过滤 (`include`)** 与 **排除过滤 (`exclude`)**：

* **最佳实践 1：锁定清晰度与语言**
  * `include`: `['1080p', '简日']`（必须同时包含 1080p 与 简日 字样）
  * `exclude`: `['720p', '繁体', 'BIG5']`（排除繁体与低分辨率版本）
* **最佳实践 2：锁定心仪的字幕组**
  * `include`: `['绿茶字幕组', '1080p']`

---

### 第三步：添加番剧订阅

您可以通过两种方式添加订阅：

#### 方式 A：在 Koishi Web 控制台配置（推荐用于全局常驻订阅）
1. 打开 Koishi 控制台 -> 进入 **插件配置** -> 找到 `anime-rss`。
2. 展开 **全局静态订阅管理 (`subscriptions`)**，点击添加一项：
   * **番剧名称**：`罗小黑战记`
   * **RSS 链接**：`https://kisssub.org/rss-罗小黑.xml`
   * **推送目标群号**：`123456789`（也可填写多个群号）
   * **包含过滤**：`1080p`, `简日`
   * **排除过滤**：`720p`, `繁体`
3. 保存配置，插件将自动常驻监听。

#### 方式 B：在群内使用指令动态添加（群管理员专属）
在需要推送的 QQ 群中直接发送：
```text
anime-rss.add https://kisssub.org/rss-罗小黑.xml 罗小黑战记 -i 1080p,简日 -e 720p,繁体
```
* 查看当前群所有生效订阅：`anime-rss.list`
* 删除指定 ID 订阅：`anime-rss.remove <id>`

---

### 第四步：网络优化与测试

1. **手动更新 Tracker 节点池**：
   在群内发送指令：
   ```text
   anime-rss.tracker -u
   ```
   插件会立即从国内 CDN 镜像拉取最新的活跃 BT Tracker 节点，扩充节点池。
2. **立即触发测试**：
   发送指令：
   ```text
   anime-rss.check
   ```
   插件会检查最新的 1 个未推送剧集并启动下载，您可在控制台日志中看到实时的 P2P 下载进度：
   ```text
   [downloader] 进度: 45% (230MiB/512MiB) | 速度: 8.5MiB | 连接节点: 36 | 做种者: 4
   ```

---

## ⚙️ 控制台配置项深度解析

可在 Koishi 控制台插件配置页中进行模块化配置：

### 1. 下载引擎设置 (Downloader)
| 配置项 | 类型 | 默认值 | 详细说明与推荐值 |
|---|---|---|---|
| `downloader` | `union` | `'builtin-aria2'` | 种子下载引擎。推荐使用 `builtin-aria2`（原生高性能 Aria2，多线程并行下载）；若在小众架构下可选用 `torrent-stream`。 |
| `aria2CustomPath` | `string` | `''` | 自定义 aria2 可执行文件路径。留空则自动使用插件内置的便携版 `aria2c` 或系统环境变量中的可执行程序。 |
| `listenPort` | `string` | `'51413-51425'` | BT 与 DHT 监听端口范围。**核心参数**：避开被国内运营商恶劣封锁限速的 6881-6999 端口，建议保留默认高位段。 |
| `stalledTimeout` | `number` | `180` | **死种熔断时限（秒）**。若在设定时间内持续无做种者（SD: 0）且下载流量为 0，自动跳过下载并向群内发送备用磁力链接，杜绝队列死锁。 |
| `downloadTimeout` | `number` | `30` | 单集种子整体下载超时时间（分钟），超时后强制释放任务。 |

### 2. Tracker 与 P2P 网络优化 (P2P & Network)
| 配置项 | 类型 | 默认值 | 详细说明与推荐值 |
|---|---|---|---|
| `trackerSync` | `boolean` | `true` | 是否自动从国内多镜像源（XIU2/TrackersList 等）定时动态同步最新活跃 BT Tracker 列表（强烈建议开启）。 |
| `customTrackers` | `array` | `[]` | 用户自定义额外追加的 BT Tracker 地址列表（支持 HTTP/HTTPS/UDP 格式）。 |

### 3. 推送与轮询设置 (Push & Polling)
| 配置项 | 类型 | 默认值 | 详细说明与推荐值 |
|---|---|---|---|
| `checkInterval` | `number` | `15` | RSS 订阅源自动轮询间隔（分钟）。设为 `0` 则关闭定时轮询，仅支持手动指令触发。 |
| `videoSizeThreshold` | `number` | `80` | 普通群视频直发上限（MB）。视频体积小于等于此阈值时直接发群视频消息；超出后自动转为上传群文件，防止画质劣化。 |
| `uploadTimeout` | `number` | `10` | **群文件上传超时时限（分钟）**。解决超大视频文件上传耗时较长被 OneBot 协议端默认 60 秒硬超时掐断的问题。 |

### 4. 存储与自动清理 (Storage & Cleanup)
| 配置项 | 类型 | 默认值 | 详细说明与推荐值 |
|---|---|---|---|
| `storagePath` | `string` | `'data/anime-rss/temp'` | 临时视频与种子文件的存放目录（相对于 Koishi 工作区根目录）。 |
| `autoClean` | `boolean` | `true` | 推送完成后是否自动删除本地临时视频与种子缓存（推荐开启，保持长期挂机零磁盘积压）。 |
| `cleanDelay` | `number` | `10` | 推送完成到执行删除的缓冲延迟时间（秒），确保协议端已完全将文件转存完毕。 |

### 5. 跨机与容器协议端网络设置 (Remote Adapter)
| 配置项 | 类型 | 默认值 | 详细说明与推荐值 |
|---|---|---|---|
| `serverHost` | `string` | `''` | 远端协议端回连 IP。留空会自动探测同网段内网 IP；若在复杂 Docker 网桥或云服务器中，可手动填写宿主机或 VPN IP。 |
| `serverPort` | `number` | `0` | 文件传输临时 HTTP 服务端口。`0` 为使用系统随机可用空闲端口。 |

### 6. 全局静态订阅管理 (Subscriptions)
可直观添加全局订阅项，重启后常驻生效：
* `name`：番剧名称
* `url`：RSS 订阅链接
* `channels`：推送群号列表（如 `['123456789']`）
* `include`：包含关键词
* `exclude`：排除关键词
* `enabled`：是否启用

---

## 💬 聊天指令说明 (Commands)

| 指令 | 权限 | 说明 |
|---|---|---|
| **`anime-rss`** | 全员 | 查看插件指令帮助与当前运行状态。 |
| **`anime-rss.add <url> [name]`** | 管理员 | 为当前群添加一条动态番剧订阅。<br>选项 `-i, --include <kw1,kw2>`：包含关键词<br>选项 `-e, --exclude <kw1,kw2>`：排除关键词 |
| **`anime-rss.remove <id>`** | 管理员 | 删除指定 ID 的群订阅（ID 可通过 `anime-rss.list` 查看）。 |
| **`anime-rss.list`** | 全员 | 查看当前群生效的所有番剧订阅列表（合并展示控制台配置与群动态订阅）。 |
| **`anime-rss.check`** | 管理员 | 立即触发一次订阅检查与更新探测。<br>默认仅测试最新的 1 个剧集；添加 `-a, --all` 可检查所有未推送更新。 |
| **`anime-rss.tracker`** | 管理员 | 查看当前 BT Tracker 节点池状态。<br>添加 `-u, --update` 可立即从全网多镜像源强制刷新最新节点列表。 |

---

## 💡 常见问题与排查指南 (FAQ)

### Q1：为什么下载启动后一直显示“连接节点 8 个，做种者 0，速度 0B”？
1. **网络混淆未生效或被运营商阻断**：请确保升级至 `1.0.1` 以上版本，插件已内置全流量混淆加密（`--bt-force-encryption=true`）与安全高位端口（`51413-51425`），能有效规避国内运营商 DPI 流量拦截。
2. **Tracker 缓存未刷新**：部分冷门资源依赖特定 Tracker，可在群内发送 `anime-rss.tracker -u` 强制拉取最新全网节点列表。
3. **真实死种**：若全网确无做种者，插件会在达到 `stalledTimeout`（默认 180 秒）后自动熔断并向群内推送备用磁力链接，无需担心下载队列卡死。

---

### Q2：推送大文件时报错 `upload_group_file Timeout with request` 怎么办？
QQ 群文件上传（尤其是数百兆的高清动画）耗时与网络上行带宽有关。OneBot 协议端通常对 API 请求有默认 60 秒的硬超时限制。
* **解决办法**：在插件配置中将 **群文件上传超时时限 (`uploadTimeout`)** 保持在 10 分钟或以上，插件会接管底层通讯并保持长连接等待，直到文件在协议端上传完毕。

---

### Q3：Koishi 和 OneBot/NapCat 部署在不同机器或 Docker 容器内，无法上传群文件？
* 当 Koishi 检测到协议端为远程主机时，会自动启动内置轻量 HTTP 流服务器（零内存占用）。
* 如果协议端与 Koishi 处于同一局域网或 VPN（ZeroTier / Tailscale / 虚拟局域网），插件会自动检测并告知协议端正确的局域网地址。
* 若 Docker 容器内网段特殊，只需在插件配置项 **`serverHost`** 中填写 Koishi 宿主机的真实内网 IP 即可。

---

### Q4：下载后的视频文件会不会占用大量磁盘？
* 不会。插件默认开启 **自动清理 (`autoClean=true`)**。在成功将视频推送为群视频或上传至 QQ 群文件后，会在短暂缓冲（默认 10 秒）后自动删除本地临时视频与种子缓存文件，长期挂机零积压。

---

## 📝 更新日志

详细的版本历史更新记录请查看 [CHANGELOG.md](./CHANGELOG.md)。

---

## 🙏 致谢与交流

- [Aria2](https://aria2.github.io/)：超轻量高性能多协议下载利器
- [TrackersListCollection (XIU2)](https://github.com/XIU2/TrackersListCollection)：国内优质高可用 BT Tracker 列表
- [P3TERX/aria2.conf](https://github.com/P3TERX/aria2.conf)：业内首屈一指的 Aria2 BT 优化参数调优方案

---

**开发者**: BYWled  
**仓库**: `koishi-plugin-anime-rss`  

萌新编写，部分借助了AI的力量，若有纰漏，还望海涵QwQ
