# 待办

新的一条记在最上面，做完就删掉。

## 钉钉日报推送

想让每天出刊的日报自动发到钉钉群。

- **现状**：框架自带的群推送只有飞书，而且推的是**精选条目卡片**（一篇一条，限 T1/T1_5 信源）；
  **日报本身不发任何群**，只发布到网站。
- **做法**：新模块 `modules/dingtalk/`，注册一个定时任务，读当天日报
  （`packages/backend/src/publication/reports.ts` 的 `dailyWithNotes`），拼成钉钉 markdown
  发到群机器人 webhook。接入点是 `site/modules/server.ts` 的 `SERVER_MODULES`，不用改框架代码。
- **配置**：`.env` 加 `DINGTALK_PUSH_ENABLED`（安全阀，默认关）、`DINGTALK_WEBHOOK_URL`、
  `DINGTALK_SECRET`。
- **卡在哪**：需要站长先建钉钉群自定义机器人（群设置 → 智能群助手 → 添加机器人 → 自定义 →
  安全设置选「加签」），拿到 webhook 地址和 `SEC` 开头的密钥。
- **默认参数（未最终确认）**：每天 08:10 发；一条消息，标题 + 导语 + 当天全部条目标题带链接 +
  日报页链接；用加签而不是自定义关键词。
- **可选**：把精选条目也实时推到钉钉群（飞书现在的行为）。

## 域名与部署

- 腾讯云 `autohot.top` 的 NS 已改到 Cloudflare（`hadlee` / `lewis.ns.cloudflare.com`），站点域名已激活。
- **未完成**：Cloudflare 隧道连着报 `Unauthorized: Tunnel not found`（token 对应的隧道被删过），
  要重新复制当前隧道的 token 到 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN`，再
  `docker compose --profile tunnel up -d --force-recreate cloudflared`；然后确认隧道里有
  `autohot.top` → `HTTP` → `web:3000` 这条 Public Hostname。
- **未完成**：通网后收尾——Cloudflare SSL/TLS 设 Full、打开 Always Use HTTPS、腾讯云防火墙删掉 3000 端口。
