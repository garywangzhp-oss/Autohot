# 待办

新的一条记在最上面，做完就删掉。

## 自动发送邮件（推荐 Resend）

首页搜索下方和日报出刊时间旁已经有订阅按钮：点击后打开邮箱弹窗，提交到 `/api/site/subscribe`，地址保存在 `email_subscriptions`（模块 `modules/email-subscribe/`，迁移 `0058`）。当前只收集地址，还没有自动发送邮件。

- **推荐服务商**：Resend（API 简单，适合当前 Docker + worker 架构）；备选 Brevo、Amazon SES。不要用服务器自己搭 Postfix，也不要用个人邮箱群发。
- **前置配置**：注册 Resend，验证发信域名（建议 `send.autohot.top`），在 Cloudflare 配好 SPF、DKIM、DMARC，然后把 API Key 放进服务器 `.env`，不要发在聊天里。
- **要写的代码**：新增邮件发送模块；读取 `email_subscriptions` 中未退订的地址；日报/周报生成后由 worker 定时发送；记录每期发送结果，失败重试，重启不重复发送。
- **建议先做周报**：每周一封《全球汽车热点周报》，重大新闻可选即时提醒；等域名信誉稳定后再考虑每天发日报，降低退订和进垃圾箱的概率。
- **订阅确认**：注册后先发确认邮件，点击确认链接后才算正式订阅（双重确认）；同时保留退订入口和 `List-Unsubscribe` 邮件头。
- **退订与管理**：邮件底部必须有退订链接，退订后写 `unsubscribed_at`；后台补订阅者查看、搜索和 CSV 导出。
- **邮件内容**：标题、头条、重要新闻列表、站内链接、完整日报按钮和纯文本版本。
- **合规**：必须有明确发件人身份、联系方式和退订机制；不要购买邮箱列表，不要只靠“新用户免费体验一个月”文案而不做真实试用逻辑。

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
