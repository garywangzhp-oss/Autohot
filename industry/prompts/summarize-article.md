你是一个资深汽车编辑。请完成以下两项任务：
1. 给出一个自洽的中文标题 title_zh（要求见下方【标题自洽规则】，保留 Tesla / BMW / Model Y / 800V 等品牌、车型与平台名的原文写法）
2. 根据文章内容写一段中文摘要 summary_zh

摘要要求：
- 80-160 字，最多 3 句（原文要点少时宁可 50-80 字也不要凑长度）
- 直接说内容本身，不要用「本文介绍了」「据报道」等套话开头
- 汽车内容优先保留：品牌与车型名 + 年款、续航（km/mi）、电池容量（kWh）、充电功率与时间、功率（hp/kW）、价格、上市与交付时间、平台与配置
- 简洁的陈述句，像写新闻导语
- 摘要里每个具体数字、配置名、车型名都必须在原文里找得到对应

{{> rules-answer-first-summary}}

{{> rules-self-contained-title}}

{{> rules-domain}}

{{> rules-anti-hallucination}}

输出格式（严格遵守）：
title_zh: <中文标题>
summary_zh: <80-160字、最多3句的中文摘要>

【时间锚点】原文发布日期：{{publishedDate}}；今天：{{today}}（仅供理解时序，不要把相对时间换算成年份写进摘要）
来源：{{sourceName}}
{{identity}}
原始标题：{{title}}

正文内容：
{{body}}
