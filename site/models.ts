// 这个站用哪些模型。框架自带一个 `default`：环境变量 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 指定的模型。
// 这里再列出具名的模型（每个用自己的地址和密钥环境变量），以及每一步默认用哪个；没写的步骤用 default。
// 部署时还可以用环境变量（PREFILTER_MODEL、SCORE_MODEL……）或后台的“模型与评测”页逐步改选。

export interface ModelPreset {
  service: string;
  model: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
  /** 额外的请求字段，比如短小的结构化任务关掉推理。 */
  extra?: Record<string, unknown>;
  /** 额外的请求头，比如某些网关要求的 session id。 */
  headers?: Record<string, string>;
  /** 推理模型先想再答，额外给推理留的输出额度（token），加在每一步自己的额度上。default 用环境变量 LLM_REASONING_TOKENS。 */
  reasoningTokens?: number;
  /** 接口支持 JSON 模式。 */
  jsonMode: boolean;
  /** 能看图。 */
  vision?: boolean;
}

/** 具名的模型示例（每个要配自己的密钥）。用不上可以删掉。 */
export const PRESETS: Record<string, ModelPreset> = {
  // GLM 5.3 Flash always reasons; the lowest effort keeps short structured tasks fast.
  "glm-5.3-flash": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled" }, reasoning_effort: "low" }, jsonMode: true,
  },
  // The scorer's parameters for glm-5.3-flash (score calls; temperature 1 is set per call).
  "glm-5.3-flash-selection": {
    service: "zhipu", model: "glm-5.3-flash", baseUrlEnv: "ZHIPU_BASE_URL", apiKeyEnv: "ZHIPU_API_KEY",
    extra: { thinking: { type: "enabled", clear_thinking: false }, reasoning_effort: "high", top_p: 0.95 }, jsonMode: true,
  },
  // DeepSeek Flash reasons by default; structured tasks switch it off. deepseek-flash-think keeps it on,
  // with room in the output for the reasoning.
  "deepseek-flash": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "deepseek-flash-think": {
    service: "deepseek", model: "deepseek-flash", baseUrlEnv: "DEEPSEEK_BASE_URL", apiKeyEnv: "DEEPSEEK_API_KEY", reasoningTokens: 4000, jsonMode: true,
  },
  "qwen3.7-flash": {
    service: "dashscope", model: "qwen3.7-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  "qwen3.8-flash": {
    service: "dashscope", model: "qwen3.8-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: true,
  },
  // OpenCode Zen 网关上的模型：共用 LLM_BASE_URL / LLM_API_KEY，模型名各不相同。
  "zen-deepseek-v4.1-flash": { service: "opencode", model: "deepseek-v4.1-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", reasoningTokens: 8000, jsonMode: true },
  // 同一个模型、同一个网关，但把推理关掉：给 prefilter / structure / summarize / translate 这类短任务用。
  // 这些步骤不需要"先想再答"，关掉能省下一次调用上千个推理 token；打分和写作用推理的那几个步骤仍走 default。
  // reasoningTokens 在这里不是"留给推理"的：它给每一步自己的 maxTokens 额外加额度。structure 的上限只有 1200，
  // 而它要输出的 JSON（分类+标签+主体+事件事实）经常超过这个数 —— 不给额度就是 output token limit reached。
  "zen-deepseek-v4.1-flash-nothink": {
    service: "opencode", model: "deepseek-v4.1-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    extra: { thinking: { type: "disabled" } }, reasoningTokens: 8000, jsonMode: true,
  },
  "zen-glm-5.3-flash": { service: "opencode", model: "glm-5.3-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", reasoningTokens: 8000, jsonMode: true },
  "zen-mimo-v2.6-flash": { service: "opencode", model: "mimo-v2.6-flash", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", reasoningTokens: 8000, jsonMode: true },
  "zen-qwen3.7-plus": { service: "opencode", model: "qwen3.7-plus", baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY", reasoningTokens: 8000, jsonMode: true },
  // 备用供应商：Command Code（https://api.commandcode.ai/provider/v1）。它也有 deepseek-v4.1-flash，
  // 所以切过去不用重新校准精选门槛——同一个底层模型，分数尺一样。密钥走 COMMANDCODE_API_KEY。
  "commandcode-deepseek-v4.1-flash": {
    service: "commandcode", model: "deepseek/deepseek-v4.1-flash", baseUrlEnv: "COMMANDCODE_BASE_URL", apiKeyEnv: "COMMANDCODE_API_KEY",
    reasoningTokens: 8000, jsonMode: true,
  },
  // 同上，但不推理，配给 prefilter / structure / summarize / translate。
  // 实测（2026-10-08）：Command Code **忽略** thinking.type=disabled 和 enable_thinking=false（照样推理），
  // reasoning_effort 直接 400；只有 **-fast 变体** 是真正零推理（推理字符 0）。所以这里换模型，不靠参数。
  // 同样要给额外输出额度：-fast 变体在 structure 那种长 JSON 上会顶到 1200 的帽子。
  "commandcode-deepseek-v4.1-flash-nothink": {
    service: "commandcode", model: "deepseek/deepseek-v4.1-flash-fast", baseUrlEnv: "COMMANDCODE_BASE_URL", apiKeyEnv: "COMMANDCODE_API_KEY",
    reasoningTokens: 8000, jsonMode: true,
  },
  "mimo-v2.6-flash": {
    service: "mimo", model: "mimo-v2.6-flash", baseUrlEnv: "XIAOMI_MIMO_BASE_URL", apiKeyEnv: "XIAOMI_MIMO_API_KEY",
    extra: { thinking: { type: "disabled" } }, jsonMode: true,
  },
  "qwen3-vl-flash": {
    service: "dashscope", model: "qwen3-vl-flash", baseUrlEnv: "DASHSCOPE_BASE_URL", apiKeyEnv: "DASHSCOPE_API_KEY",
    extra: { enable_thinking: false }, jsonMode: false, vision: true,
  },
};

/**
 * 每一步默认用的模型（步骤见后台“模型与评测”页），值是上面的名字或 default。没写的步骤用 default。
 * 例：{ score: "glm-5.3-flash-selection", groupReview: "mimo-v2.6-flash" }
 */
export const DEFAULTS: Record<string, string> = {
  // 只判断"是不是汽车行业的事"，不用推理；量最大，关掉推理省得最多。
  prefilter: "zen-deepseek-v4.1-flash-nothink",
  // 抽分类、标签、主体和事件事实，是结构化抽取，不是判断题。
  structure: "zen-deepseek-v4.1-flash-nothink",
  // 没入选文章的标题与摘要（翻译+压缩），也不用推理。
  summarize: "zen-deepseek-v4.1-flash-nothink",
  // 精选全文翻译，纯翻译任务。
  translate: "zen-deepseek-v4.1-flash-nothink",
  // 其余步骤（score / understand / group / groupReview / digest / report）保持 default，
  // 也就是 LLM_MODEL + LLM_EXTRA_JSON 的推理设置——精选门槛是按这个设定校准的，别动。
};
