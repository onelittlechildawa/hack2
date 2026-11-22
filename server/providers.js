const CF_URL = "https://api.cloudflare.com/client/v4/accounts/62f5bbf3abc71e414222f14a94adfacd/ai/v1/chat/completions";

function extractObject(content) {
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(content.slice(start, end + 1));
    if (typeof value.name === "string" && value.name.trim() && typeof value.quote === "string" && value.quote.trim()) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

export function providers({ cloudflare, openai }) {
  const settings = [
    {
      enabled: Boolean(cloudflare),
      token: cloudflare,
      label: "Gemini 4 Hydrogen",
      source: "gemini",
      url: process.env.CLOUDFLARE_CHAT_URL || CF_URL,
      headers: { "cf-aig-gateway-id": process.env.CLOUDFLARE_GATEWAY_ID || "tmp" },
      body: {
        model: "google/gemini-4-hydrogen",
        max_tokens: 2600,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
      },
    },
    {
      enabled: Boolean(openai),
      token: openai,
      label: "GPT",
      source: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {},
      body: { model: process.env.OPENAI_MODEL || "gpt-5-mini", max_completion_tokens: 1200, reasoning_effort: "minimal" },
    },
  ].filter(({ enabled }) => enabled);

  return {
    labels: settings.map(({ label }) => label),
    async create(prompt, sketch) {
      const content = sketch ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: sketch } },
      ] : prompt;
      for (const model of settings) {
        try {
          const response = await fetch(model.url, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(26_000),
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${model.token}`, ...model.headers },
            body: JSON.stringify({ ...model.body, messages: [{ role: "user", content }] }),
          });
          if (response.ok) {
            const data = await response.json();
            const value = extractObject(data.choices?.[0]?.message?.content);
            if (value) return { value, source: model.source };
          } else {
            await response.body?.cancel();
          }
          console.warn(`[${model.label}] ${response.ok ? "配方无效" : `HTTP ${response.status}`}`);
        } catch (error) {
          console.warn(`[${model.label}] ${error.name}`);
        }
      }
      return null;
    },
  };
}
