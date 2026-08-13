# 缪斯信笺 · MuseLetter

> 尺素之间，听见回音。

一个无需登录的「写信 → AI 回信 → 有声朗读」应用：选一位人设对象（可试听声音）、落款笔名、写一封信，回信按段落慢慢浮现，每一段都能用对方的声音读出来。写完的信自动收进信箱，可以反复回看、重新回信，也可以生成分享链接。

## 架构

- **信笺应用（本仓库）**：独立部署，存储独立（MySQL `aicho_muse_letter` + 本地音频缓存），匿名访客（浏览器 `localStorage` 持久的 `visitor_id`）隔离信箱。
- **缪斯公共接口（aicho-muse 仓库）**：`/api/v1/letter/*` 提供人设/音色列表、Fish 音色广场搜索、AI 回信生成、分段 TTS。信笺后端只依赖这几个公开接口，并通过 `MUSE_BASE_URL` 配置。

## 核心功能

| 能力 | 说明 |
| --- | --- |
| 写信 | 选择对象（官方预设优先爱莉希雅）、笔名、信纸正文（≤3000 字） |
| 自定义对象 | 起名字/一句话/性格，从 Fish 音色广场搜索并挑选音色（可试听） |
| 回信 | DeepSeek v4-flash 按人设生成 3-6 段回信，逐段浮现动画 |
| 朗读 | 每段用对象音色合成语音，缓存到本地；同一时间只读一段 |
| 单段重生成 | 任何一段可单独重新合成语音 |
| 试听 | 人设卡片/广场音色均可试听 |
| 信箱 | 每次写完全自动保存，列表展示对象/笔名/摘要/时间 |
| 分享 | 生成只读分享链接，可随时关闭 |

## 本地开发

```bash
# 后端
cd server && npm install
MUSE_BASE_URL=https://muse.danzaii.cn/api/v1/letter npm run dev
# 前端
cd web && npm install && npm run dev
```

生产构建：`cd web && npm run build`，后端会自动托管 `web/dist`。

## Docker 部署

```bash
docker compose up -d --build
```

环境变量：

- `MUSE_BASE_URL`：缪斯 letter 公共接口，默认 `http://172.26.0.1:3002/api/v1/letter`（容器访问宿主 muse）
- `MYSQL_*`：数据库配置（默认 `aicho_muse_letter` / `letter`）
- `APP_PORT`：宿主机映射端口（默认 3004）

## 接口一览

- `GET  /api/v1/letters/personas` 写信对象列表
- `POST /api/v1/letters` 寄信（异步回信）
- `GET  /api/v1/letters` 信箱
- `GET  /api/v1/letters/:id` 信件详情（含回信段落与音频）
- `POST /api/v1/letters/:id/regen` 重新回信
- `POST /api/v1/letters/:id/share` / `DELETE .../share` 分享开关
- `GET  /api/v1/share/:token` 只读分享快照
- `POST /api/v1/letters/preview-voice` 音色试听
- `GET  /api/v1/audio/:file` 本地音频
