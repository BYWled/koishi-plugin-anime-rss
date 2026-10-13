# Changelog

本项目的所有关键更改都将记录在此文件中。

### [1.0.2]

#### 🚀 P2P & Tracker Breakthrough (P2P与Tracker彻底提速)

- **exclude-dead-trackers**: 引入 `--bt-exclude-tracker=*` 强制剔除种子文件与磁力链接中内嵌的 20+ 个历史失效 Trackers，消除 Aria2 按 Tier 逐级超时重试对主下载线程的阻塞，确保请求全部打在活跃的 Tier 1 Tracker 节点上。
- **port-fallback**: 监听端口升级为多段容灾模式（`51413-51425,6881-6999,16881-16899`），彻底解决 Windows Hyper-V / NAT 动态端口排除导致 UDP 端口绑定失败（`DHT is disabled`）及 UDP Tracker 全面失效的问题。
- **tracker-subscription-expand**: 增强 `customTrackers` 与 `syncTrackers` 对 `.txt` 订阅源链接（如 `ATaria2_best.txt`）的自动识别与展开拉取，并在直传参数中过滤订阅 URL 避免污染 Aria2 参数。
- **anime-tracker-mirror**: 默认镜像源收录 `DeSireFire/animeTrackerList` 动漫专属 Tracker 订阅，优化静态备用节点连通性优先级。

### [1.0.1]

#### 🚀 Performance & Connectivity (网络连通与做种提速)

- **tracker-tls**: 修复 Windows 下 Aria2 缺失 CA 根证书导致 HTTPS Trackers 握手失败的问题（引入 `--check-certificate=false`）。
- **encryption**: 强制开启 BitTorrent 混淆握手与数据传输加密（`--bt-force-encryption=true`），绕过国内运营商 DPI 流量审查并兼容海外强制加密的 Seedbox。
- **port-remap**: 默认监听端口迁移至安全高位端口段（`51413-51425`），彻底规避国内运营商对 6881-6999 BT 默认端口的封锁与限速。
- **peer-agent**: 补全 BEP 10 扩展握手客户端伪装（`--peer-agent=qBittorrent/4.6.3`），避免被海外做种端反吸血策略误判 Choke。
- **peer-speed-limit**: 引入并发索取加速机制（`--bt-request-peer-speed-limit=10M`），大幅提升启动期获取分片的抢占速度。
- **bencode-verify**: 种子文件增加首字节 `0x64`（Bencode 字典）完整性校验，杜绝网络异常时将 Cloudflare/HTML 错误页误写入种子。
- **trackers-pool**: 扩展内置精选 Tracker 列表，新增 ACG.RIP、Camoe、Ready4.icu 等中文二次元高活跃源。

#### 📖 Documentation & UX (配置页说明与教程完善)

- **schema-redesign**: 采用分组卡片式重构控制台配置页面（涵盖下载引擎、网络优化、推送分流、存储清理、容器网络、静态订阅 6 大板块），全量补全详细中文注释与推荐值。
- **docs-tutorial**: 完善项目文档与从零上手教程，涵盖 RSS 订阅源获取指南、关键词过滤避坑技巧及深度 FAQ 排查手册。

### [1.0.0]

#### ✨ Features (新特性)

- **rss**: 支持监听与智能解析各类番剧 RSS 订阅源（KissSub、Mikan 等），支持多重关键词 include/exclude 过滤。
- **downloader**: 双引擎下载支持，内置高性能 Aria2 便携式下载器并自动注入全网最新活跃 Tracker，彻底解决死种无流量问题。
- **stalled-circuit**: 智能死种熔断保护，持续无做种者自动熔断并降级推送磁力链接，保障队列畅通。
- **sender**: 智能分流群推送，支持普通群视频消息与群文件直传自动切换。
- **remote-stream**: 内置跨机/Docker 零堆内存 HTTP 流式传输服务与 10 分钟超长上传超时容忍，解决大文件上传被协议端 60 秒硬超时熔断问题。
- **commands**: 提供完善的群内指令系统（`anime-rss.add`、`anime-rss.remove`、`anime-rss.list`、`anime-rss.check`），测试指令默认只拉取最新 1 集。
- **memory**: 全流程贯彻 Zero-Heap 内存优化与即用即删生命周期管理，长期挂机零内存溢出风险。
