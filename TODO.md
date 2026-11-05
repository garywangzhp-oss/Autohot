# 待办

新的一条记在最上面，做完就删掉。

## Resend 邮件订阅上线配置（代码已完成）

首页和日报页的订阅弹窗现在会发送双重确认邮件；确认后每周一收到中文或英文周报摘要，支持一键退订和切换邮件语言。发送记录按订阅者、期号和语言去重，失败会指数退避重试，最多 5 次。

- **仍需站长操作**：在 Resend 验证发件域名，在 Cloudflare 配好 SPF、DKIM、DMARC，然后在服务器 `.env` 填写 `RESEND_API_KEY`、`NEWSLETTER_FROM`、`NEWSLETTER_TOKEN_SECRET`，把 `NEWSLETTER_SEND_ENABLED` 改成 `true`。
- **部署**：先跑数据库迁移，再重启 api 和 worker。未配置完整时订阅接口会明确返回暂时不可用，不会假装成功。
- **隐私说明**：正文已按实际的确认状态、语言偏好、投递记录和 Resend 委托处理更新，上线前仍需站长本人复核。
- **后续可选**：后台订阅者查看、搜索和 CSV 导出；日报即时邮件和付费套餐不包含在本次免费周报功能中。

## 钉钉日报推送

想让每天出刊的日报自动发到钉钉群。**模块已经写好了**（`modules/dingtalk/server.ts` + 测试），
只差两个环境变量就能上线。

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
- **已完成**：Cloudflare 隧道通了，站点在 **https://www.autohot.top** 正常访问（200）。
- **未完成**：根域名 `autohot.top` 没有 DNS 记录（只有 `www` 有）。修法：Cloudflare →
  隧道 → Public Hostname 里再加一条，Subdomain **留空**、Domain `autohot.top`、Service `HTTP` → `web:3000`。
- **未完成**：腾讯云防火墙 3000 端口目前对外不通（按之前的收尾做掉了）；如果要保留 IP 直连访问就加回来。
