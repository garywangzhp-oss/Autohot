// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 这里是汽车行业（全球范围）的示例配置：整车厂、电动化与三电、智能驾驶、供应链、政策法规。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（评测、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  { key: "new-models", label: "新车", feedLabel: "新车发布", section: "新车", guide: "全新车型、改款、换代、概念车全球首发、正式上市、开启预售与开始交付的发布信息，以及官方公布的售价、配置、续航、动力与尺寸参数。单一碰撞测试成绩不是新车发布，归评测。" },
  { key: "sales", label: "销量与市场", feedLabel: "销量与市场", section: "市场与销量", guide: "车企与车型的销量、交付量、上牌量、市占率、订单与终端价格变化，以及分地区、分品牌的市场格局。企业整体的营收与利润归财务与资本。" },
  { key: "electrification", label: "电动化", feedLabel: "电动化与三电", section: "电动化与三电", guide: "纯电、插混、增程、油电混动与燃料电池等动力形式，以及电池、电驱、电控（三电）技术本身的变化。整车平台或具体车型的发布归新车，充电网络与能源供给归能源与充电。" },
  { key: "autonomous", label: "智能驾驶", feedLabel: "智能化与自动驾驶", section: "智能化与自动驾驶", guide: "辅助驾驶与自动驾驶的技术路线、量产落地、法规许可、事故与调查，以及 Robotaxi 的运营。车机、座舱与车载软件的更新归汽车技术与软件。" },
  { key: "technology", label: "汽车技术与软件", feedLabel: "技术与软件", section: "技术与软件", guide: "整车平台与电子电气架构、智能座舱、车机系统、车载软件、OTA、芯片与传感器的技术进展，以及软件定义汽车相关的工程实践。三电本身归电动化，零部件厂商的经营动态归供应链。" },
  { key: "supply-chain", label: "供应链", feedLabel: "供应链", section: "供应链与制造", guide: "电池、芯片、电驱、传感器、轮胎与内饰等零部件和 Tier 1 供应商的动态，以及原材料、缺货、关税与供应链风险。自有工厂的建设、产能与停产归制造与工厂。" },
  { key: "manufacturing", label: "制造与工厂", feedLabel: "制造与工厂", section: "供应链与制造", guide: "整车与零部件工厂的新建、扩产、停产、裁员与产能利用率，以及生产工艺、自动化与本地化生产布局。" },
  { key: "companies", label: "企业与高管", feedLabel: "企业与高管", section: "企业与经营", guide: "车企与供应链公司的组织、人事与治理：高管任免、团队重组、战略调整、合作与竞争、召回与安全事件的处置。经营结果归财务与资本，市场表现归销量与市场。" },
  { key: "industry", label: "行业趋势", feedLabel: "行业趋势", section: "行业趋势", guide: "跨企业的行业现象与走向：渗透率变化、价格战、品牌格局、出海与全球化等产业趋势。单个企业的具体经营动作归企业与高管。" },
  { key: "policy", label: "政策法规", feedLabel: "政策法规", section: "政策法规", guide: "各国和地区的汽车法规、排放与安全标准、补贴与关税、准入与合规要求、监管调查与召回指令。企业自愿做出的承诺归企业与高管。" },
  { key: "finance", label: "财务与资本", feedLabel: "财务与资本", section: "企业与经营", guide: "车企与供应链公司的营收、利润、现金流、财报、融资、IPO、并购与估值。销量与交付量归销量与市场。" },
  { key: "energy", label: "能源与充电", feedLabel: "能源与充电", section: "电动化与三电", guide: "充电网络与超充、换电、V2G、家充与补能体验，以及电力、氢能与可再生能源供给对汽车的影响。电池与三电技术本身归电动化。" },
  { key: "mobility", label: "出行与商业模式", feedLabel: "出行与商业模式", section: "行业趋势", guide: "共享出行、租赁、订阅、二手车、经销商与直营模式，以及软件订阅等新的商业模式。单车产品归新车，智驾技术归智能驾驶。" },
  { key: "motorsport", label: "赛车运动", feedLabel: "赛车运动", section: "赛车运动", guide: "F1、Formula E、WEC、WRC、NASCAR 等赛事与车队动态，以及赛事技术向量产车的迁移。纯改装与车迷文化不作精选。" },
  { key: "review", label: "评测", feedLabel: "评测", section: "评测与观点", guide: "媒体或第三方做的车型实测、对比评测、拆解、碰撞测试与长测。重点是可验证的测试结果和可迁移的工程认知；只有态度和预测而无实测归观点。", commentary: true },
  { key: "opinion", label: "观点", feedLabel: "观点", section: "评测与观点", guide: "重点是作者的解释、判断、主张、预测、评论或访谈观点。讨论市场不自动归行业趋势，作者是名人不自动归观点。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（汽车行业是新车）：日报报头的“N 款新车”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "new-models", tag: "新车发布", unit: "款新车" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算在内。 */
export const PLAIN_TERMS: readonly string[] = [
  "ev", "bev", "phev", "hev", "suv", "mpv", "adas", "oem", "ota", "wltp", "cltc", "epa",
  "awd", "fwd", "rwd", "nvh", "kwh", "kw", "nm", "fsd", "v2g", "v2l", "sop", "ice", "l2", "l3", "l4",
];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["new_model", "product_update", "technology", "industry_event", "policy_regulation", "review_test", "opinion_analysis"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "新车发布", "销量/市场", "电动化/三电", "智能驾驶", "技术/软件", "供应链", "制造/工厂", "企业/高管",
  "行业趋势", "政策法规", "财务/资本", "能源/充电", "出行/商业模式", "赛车运动", "评测/实测", "观点/分析", "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "新能源", "纯电", "插混/增程", "电池", "充电/补能", "智能座舱", "车机/OTA", "芯片", "平台/架构",
  "安全", "性能", "设计", "氢燃料", "商用车", "产能", "出口/全球化", "Robotaxi", "经销商",
] as const;

/** 可选的实体标签（整车厂、供应商、平台）。 */
export const ENTITY_TAGS = [
  "Tesla", "Toyota", "Volkswagen", "GM", "Ford", "Stellantis", "Hyundai", "Kia", "BYD", "Mercedes-Benz",
  "BMW", "Honda", "Nissan", "NIO", "XPeng", "Li Auto", "Xiaomi", "CATL", "Bosch", "Waymo", "Mobileye", "Volvo", "Renault",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  新车: "新车发布", 上市: "新车发布", 首发: "新车发布", 改款: "新车发布", 换代: "新车发布", 车型发布: "新车发布", "新车/发布": "新车发布",
  销量: "销量/市场", 交付量: "销量/市场", 市占率: "销量/市场", 价格战: "销量/市场", 上牌量: "销量/市场", 市场: "销量/市场",
  电动化: "电动化/三电", 三电: "电动化/三电", 电动: "电动化/三电",
  自动驾驶: "智能驾驶", 辅助驾驶: "智能驾驶", 智驾: "智能驾驶", 智能辅助: "智能驾驶",
  技术: "技术/软件", 软件: "技术/软件", 技术创新: "技术/软件", 技术进展: "技术/软件", 智能座舱: "智能座舱", 座舱: "智能座舱",
  零部件: "供应链", 供应商: "供应链", 供应链: "供应链",
  工厂: "制造/工厂", 制造: "制造/工厂", 产能: "制造/工厂", 停产: "制造/工厂",
  高管: "企业/高管", 人事: "企业/高管", 企业: "企业/高管", 公司: "企业/高管",
  趋势: "行业趋势", 现象: "行业趋势", 行业: "行业趋势", 动态: "行业趋势",
  法规: "政策法规", 政策: "政策法规", 监管: "政策法规", 标准: "政策法规", 补贴: "政策法规", 关税: "政策法规",
  财报: "财务/资本", 融资: "财务/资本", 资本: "财务/资本", 收购: "财务/资本", 并购: "财务/资本", 投资: "财务/资本",
  能源: "能源/充电", 充电: "充电/补能", 补能: "充电/补能", 换电: "充电/补能", 快充: "充电/补能",
  出行: "出行/商业模式", 商业模式: "出行/商业模式", 共享出行: "出行/商业模式",
  赛车: "赛车运动", 赛事: "赛车运动", f1: "赛车运动",
  评测: "评测/实测", 实测: "评测/实测", 测试: "评测/实测", 对比: "评测/实测", 拆解: "评测/实测", 碰撞测试: "评测/实测", 长测: "评测/实测",
  观点: "观点/分析", 分析: "观点/分析", 评论: "观点/分析", 解读: "观点/分析", 访谈: "观点/分析", 预测: "观点/分析",
  半导体: "芯片", 车机: "车机/OTA", ota: "车机/OTA",
  平台: "平台/架构", 架构: "平台/架构", 底盘: "平台/架构",
  氢能: "氢燃料", 氢燃料: "氢燃料", 燃料电池: "氢燃料",
  商用车: "商用车", 卡车: "商用车", 客车: "商用车", 皮卡: "商用车",
  出口: "出口/全球化", 出海: "出口/全球化", 全球化: "出口/全球化",
  电池组: "电池", 动力电池: "电池",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；otherNames 是公司自己的其他称呼（官方账号名、子品牌），
 * 把事实的主体对到发布方时也认它们。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; otherNames?: string[] }> = {
  tesla: { name: "Tesla", displayTag: "Tesla", aliases: ["Tesla", "特斯拉"], otherNames: ["Tesla Motors", "Tesla China"] },
  toyota: { name: "Toyota", displayTag: "Toyota", aliases: ["Toyota", "丰田"], otherNames: ["Toyota Motor", "Lexus", "雷克萨斯", "Toyota Newsroom"] },
  volkswagen: { name: "Volkswagen", displayTag: "Volkswagen", aliases: ["Volkswagen", "大众", "VW"], otherNames: ["Volkswagen Group", "VW Group", "Audi", "奥迪", "Porsche", "保时捷", "Škoda", "Skoda", "斯柯达", "SEAT", "CUPRA"] },
  gm: { name: "General Motors", displayTag: "GM", aliases: ["General Motors", "GM", "通用汽车"], otherNames: ["Chevrolet", "雪佛兰", "Cadillac", "凯迪拉克", "Buick", "别克", "GMC"] },
  ford: { name: "Ford", displayTag: "Ford", aliases: ["Ford", "福特"], otherNames: ["Ford Motor", "Lincoln", "林肯"] },
  stellantis: { name: "Stellantis", displayTag: "Stellantis", aliases: ["Stellantis", "斯特兰蒂斯"], otherNames: ["Peugeot", "标致", "Citroën", "雪铁龙", "Fiat", "菲亚特", "Opel", "欧宝", "Jeep", "Ram", "Dodge", "道奇", "Alfa Romeo", "阿尔法罗密欧", "Maserati", "玛莎拉蒂"] },
  hyundai: { name: "Hyundai", displayTag: "Hyundai", aliases: ["Hyundai", "现代汽车"], otherNames: ["Hyundai Motor", "Genesis", "捷尼赛思", "Hyundai News"] },
  kia: { name: "Kia", displayTag: "Kia", aliases: ["Kia", "起亚"], otherNames: ["Kia Motors", "起亚汽车"] },
  byd: { name: "BYD", displayTag: "BYD", aliases: ["BYD", "比亚迪"], otherNames: ["BYD Auto", "Denza", "腾势", "Yangwang", "仰望", "Fangchengbao", "方程豹"] },
  mercedes: { name: "Mercedes-Benz", displayTag: "Mercedes-Benz", aliases: ["Mercedes-Benz", "Mercedes", "奔驰", "梅赛德斯"], otherNames: ["Daimler", "戴姆勒", "AMG", "Maybach", "迈巴赫", "EQ"] },
  bmw: { name: "BMW", displayTag: "BMW", aliases: ["BMW", "宝马"], otherNames: ["BMW Group", "Mini", "Rolls-Royce", "劳斯莱斯", "BMW PressClub"] },
  honda: { name: "Honda", displayTag: "Honda", aliases: ["Honda", "本田"], otherNames: ["Acura", "讴歌", "Honda Motor"] },
  nissan: { name: "Nissan", displayTag: "Nissan", aliases: ["Nissan", "日产"], otherNames: ["Infiniti", "英菲尼迪", "Nissan Motor"] },
  rivian: { name: "Rivian", displayTag: null, aliases: ["Rivian"] },
  lucid: { name: "Lucid", displayTag: null, aliases: ["Lucid", "Lucid Motors"] },
  nio: { name: "NIO", displayTag: "NIO", aliases: ["NIO", "蔚来"], otherNames: ["蔚来汽车", "Onvo", "乐道", "Firefly", "萤火虫"] },
  xpeng: { name: "XPeng", displayTag: "XPeng", aliases: ["XPeng", "小鹏"], otherNames: ["小鹏汽车", "XPeng Motors"] },
  "li-auto": { name: "Li Auto", displayTag: "Li Auto", aliases: ["Li Auto", "理想汽车"], otherNames: ["Li Auto Inc"] },
  xiaomi: { name: "Xiaomi", displayTag: "Xiaomi", aliases: ["Xiaomi", "小米"], otherNames: ["小米汽车", "Xiaomi EV", "Xiaomi Auto"] },
  catl: { name: "CATL", displayTag: "CATL", aliases: ["CATL", "宁德时代"], otherNames: ["Contemporary Amperex Technology"] },
  bosch: { name: "Bosch", displayTag: null, aliases: ["Bosch", "博世"] },
  waymo: { name: "Waymo", displayTag: null, aliases: ["Waymo"] },
  mobileye: { name: "Mobileye", displayTag: null, aliases: ["Mobileye"] },
  volvo: { name: "Volvo", displayTag: "Volvo", aliases: ["Volvo", "沃尔沃"], otherNames: ["Volvo Cars", "Polestar", "极星"] },
  renault: { name: "Renault", displayTag: null, aliases: ["Renault", "雷诺"], otherNames: ["Renault Group", "Dacia", "达契亚", "Alpine"] },
  geely: { name: "Geely", displayTag: "Geely", aliases: ["Geely", "吉利"], otherNames: ["吉利汽车", "Zeekr", "极氪", "Lynk & Co", "领克", "Volvo"] },
  tata: { name: "Tata Motors", displayTag: null, aliases: ["Tata Motors", "塔塔汽车"], otherNames: ["Jaguar", "捷豹", "Land Rover", "路虎"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "tesla", name: "Tesla", patterns: [/tesla|特斯拉|\bmodel\s?[3sxy]\b|cybertruck/i] },
  { id: "toyota", name: "Toyota", patterns: [/toyota|丰田|lexus|雷克萨斯|\bbz4x\b|prius|卡罗拉|corolla|rav4/i] },
  { id: "volkswagen", name: "Volkswagen", patterns: [/volkswagen|\bvw\b|大众汽车|audi|奥迪|porsche|保时捷|škoda|skoda|斯柯达|cupra|\bid\.?\s?\d/i] },
  { id: "gm", name: "General Motors", patterns: [/general motors|\bgm\b|通用汽车|cadillac|凯迪拉克|chevrolet|雪佛兰|buick|别克|\bgmc\b|bolt\b/i] },
  { id: "ford", name: "Ford", patterns: [/\bford\b|福特|lincoln|林肯|\bf-150\b|mustang|野马/i] },
  { id: "stellantis", name: "Stellantis", patterns: [/stellantis|斯特兰蒂斯|peugeot|标致|citro(ë|e)n|雪铁龙|fiat|菲亚特|opel|欧宝|jeep|ram\b|dodge|道奇|alfa romeo|阿尔法/i] },
  { id: "hyundai", name: "Hyundai", patterns: [/hyundai|现代汽车|genesis|捷尼赛思|ioniq/i] },
  { id: "kia", name: "Kia", patterns: [/\bkia\b|起亚|\bev\d\b/i] },
  { id: "byd", name: "BYD", patterns: [/\bbyd\b|比亚迪|denza|腾势|仰望|yangwang|方程豹|刀片电池/i] },
  { id: "mercedes", name: "Mercedes-Benz", patterns: [/mercedes|奔驰|梅赛德斯|\bamg\b|迈巴赫|maybach|\beq[a-z]?\b|\bcla\b|\bglc\b/i] },
  { id: "bmw", name: "BMW", patterns: [/\bbmw\b|宝马|\bmini\b|劳斯莱斯|rolls-?royce|\bi[3-7]\b|\bix\b|\bx[1-7]\b/i] },
  { id: "honda", name: "Honda", patterns: [/\bhonda\b|本田|讴歌|acura|\bcivic\b|思域|\bcr-v\b/i] },
  { id: "nissan", name: "Nissan", patterns: [/\bnissan\b|日产|英菲尼迪|infiniti|\bleaf\b|轩逸/i] },
  { id: "rivian", name: "Rivian", patterns: [/\brivian\b|\br1[st]\b|\br2\b/i] },
  { id: "lucid", name: "Lucid", patterns: [/\blucid\b|\bair\b.*lucid|lucid air/i] },
  { id: "nio", name: "NIO", patterns: [/\bnio\b|蔚来|\bonvo\b|乐道|\bfirefly\b|萤火虫/i] },
  { id: "xpeng", name: "XPeng", patterns: [/\bxpeng\b|小鹏|\bp7\+?\b|\bg6\b|\bg9\b/i] },
  { id: "li-auto", name: "Li Auto", patterns: [/\bli auto\b|理想汽车|\bl6\b|\bl7\b|\bl8\b|\bl9\b|\bmega\b/i] },
  { id: "xiaomi", name: "Xiaomi", patterns: [/小米汽车|\bxiaomi\b.*\b(?:ev|auto|car)\b|\bsu7\b|\byu7\b/i] },
  { id: "catl", name: "CATL", patterns: [/\bcatl\b|宁德时代|神行电池|麒麟电池/i] },
  { id: "bosch", name: "Bosch", patterns: [/\bbosch\b|博世/i] },
  { id: "waymo", name: "Waymo", patterns: [/\bwaymo\b/i] },
  { id: "mobileye", name: "Mobileye", patterns: [/mobileye/i] },
  { id: "volvo", name: "Volvo", patterns: [/\bvolvo\b|沃尔沃|polestar|极星|\bex\d0\b/i] },
  { id: "renault", name: "Renault", patterns: [/renault|雷诺|dacia|达契亚|alpine/i] },
  { id: "geely", name: "Geely", patterns: [/geely|吉利|zeekr|极氪|lynk|领克|极越|极星/i] },
  { id: "tata", name: "Tata Motors", patterns: [/tata|塔塔|jaguar|捷豹|land rover|路虎/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 YouTube、汽车媒体不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "tesla", domains: ["tesla.com"] },
  { entityId: "toyota", domains: ["toyota.com", "toyotanewsroom.com", "global.toyota"] },
  { entityId: "volkswagen", domains: ["volkswagen-newsroom.com", "volkswagenag.com"] },
  { entityId: "gm", domains: ["gm.com", "media.gm.com"] },
  { entityId: "ford", domains: ["ford.com", "media.ford.com"] },
  { entityId: "stellantis", domains: ["stellantis.com"] },
  { entityId: "hyundai", domains: ["hyundai.com", "hyundainews.com"] },
  { entityId: "kia", domains: ["kia.com", "press.kia.com"] },
  { entityId: "byd", domains: ["byd.com", "bydglobal.com"] },
  { entityId: "mercedes", domains: ["mercedes-benz.com"] },
  { entityId: "bmw", domains: ["bmwgroup.com", "press.bmwgroup.com", "bmw.com"] },
  { entityId: "honda", domains: ["honda.com", "global.honda"] },
  { entityId: "nissan", domains: ["nissannews.com", "nissan-global.com"] },
  { entityId: "rivian", domains: ["rivian.com"] },
  { entityId: "lucid", domains: ["lucidmotors.com"] },
  { entityId: "nio", domains: ["nio.com"] },
  { entityId: "xpeng", domains: ["xiaopeng.com", "heyxpeng.com"] },
  { entityId: "li-auto", domains: ["liauto.com", "lixiang.com"] },
  { entityId: "xiaomi", domains: ["mi.com", "xiaomiev.com"] },
  { entityId: "catl", domains: ["catl.com"] },
  { entityId: "volvo", domains: ["volvocars.com"] },
  { entityId: "renault", domains: ["renaultgroup.com"] },
  { entityId: "geely", domains: ["geely.com", "zgh.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "bmw", pattern: /@BMWGroup\b/i },
  { entityId: "hyundai", pattern: /@Hyundai\b/i },
  { entityId: "toyota", pattern: /@Toyota\b/i },
  { entityId: "nio", pattern: /@NIOGlobal\b/i },
];
