/**
 * Provider-agnostic AI adapters. Each adapter takes a system + user prompt and
 * returns raw text (expected to be JSON). Only ever executed server-side.
 *
 * Configure with:
 *   AI_PROVIDER = gemini | openai | anthropic
 *   AI_MODEL    = model name (optional, sensible default per provider)
 *   AI_API_KEY  = provider API key
 *   AI_BASE_URL = optional (OpenAI-compatible endpoints)
 */
export type AiProvider = "gemini" | "openai" | "anthropic";

export interface AiConfig {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

export function getAiConfig(): AiConfig | null {
  const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase() as AiProvider;
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  if (!(provider in DEFAULT_MODELS)) return null;
  return {
    provider,
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider],
    apiKey,
    baseUrl: process.env.AI_BASE_URL || undefined,
  };
}

export interface AiRequest {
  system: string;
  user: string;
  signal: AbortSignal;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`AI provider HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function callAiProvider(cfg: AiConfig, req: AiRequest): Promise<string> {
  switch (cfg.provider) {
    case "gemini": {
      const base = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
      const data = await postJson(
        `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        { "x-goog-api-key": cfg.apiKey },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 1.0, maxOutputTokens: 4096 },
        },
        req.signal,
      );
      const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
      const text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new Error("Empty Gemini response");
      return text;
    }
    case "openai": {
      const base = cfg.baseUrl ?? "https://api.openai.com/v1";
      const data = await postJson(
        `${base}/chat/completions`,
        { Authorization: `Bearer ${cfg.apiKey}` },
        {
          model: cfg.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        },
        req.signal,
      );
      const choices = data.choices as { message?: { content?: string } }[] | undefined;
      const text = choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty OpenAI response");
      return text;
    }
    case "anthropic": {
      const base = cfg.baseUrl ?? "https://api.anthropic.com/v1";
      const data = await postJson(
        `${base}/messages`,
        { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: cfg.model,
          max_tokens: 2048,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        req.signal,
      );
      const content = data.content as { type: string; text?: string }[] | undefined;
      const text = content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      if (!text) throw new Error("Empty Anthropic response");
      return text;
    }
  }
}

/** Extract the first JSON object from a model response (handles ```json fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in AI response");
  return JSON.parse(text.slice(start, end + 1));
}
