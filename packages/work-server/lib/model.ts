import type { Model } from "@mariozechner/pi-ai";

export function createOpenAICompatModel(): Model<"openai-completions"> {
  const baseUrl =
    process.env.OPENAI_API_BASE_URL ?? "http://127.0.0.1:18000/v1";
  const id = process.env.OPENAI_API_MODEL ?? "sn";

  return {
    id,
    name: `OpenAI-compatible (${id})`,
    api: "openai-completions",
    provider: "openai-compat",
    baseUrl,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}
