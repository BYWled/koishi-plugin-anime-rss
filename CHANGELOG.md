# Changelog

本项目的所有关键更改都将记录在此文件中。

### [1.0.0]

#### ✨ Features (新特性)

- **rss**: 支持监听与智能解析各类番剧 RSS 订阅源（KissSub、Mikan 等），支持多重关键词 include/exclude 过滤。
- **downloader**: 双引擎下载支持，内置高性能 Aria2 便携式下载器并自动注入全网最新活跃 Tracker，彻底解决死种无流量问题。
- **stalled-circuit**: 智能死种熔断保护，持续无做种者自动熔断并降级推送磁力链接，保障队列畅通。
- **sender**: 智能分流群推送，支持普通群视频消息与群文件直传自动切换。
- **remote-stream**: 内置跨机/Docker 零堆内存 HTTP 流式传输服务与 10 分钟超长上传超时容忍，解决大文件上传被协议端 60 秒硬超时熔断问题。
- **commands**: 提供完善的群内指令系统（`anime-rss.add`、`anime-rss.remove`、`anime-rss.list`、`anime-rss.check`），测试指令默认只拉取最新 1 集。
- **memory**: 全流程贯彻 Zero-Heap 内存优化与即用即删生命周期管理，长期挂机零内存溢出风险。
