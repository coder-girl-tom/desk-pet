// Cloudflare Worker: serves the website files and answers POST /api/chat.
// The Gemini key stays in Cloudflare (secret GEMINI_API_KEY), never in GitHub.
// Only models that support fast "minimal" thinking. The one that works is remembered,
// so later requests do not waste time trying models that failed.
const MODELS = ["gemini-3.8-flash", "gemini-3-flash-preview"];
let goodModel = null;

async function chat(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY is not set in Cloudflare", { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const { system, contents } = body;
  if (typeof system !== "string" || system.length > 20000 ||
      !Array.isArray(contents) || contents.length === 0 || contents.length > 40) {
    return new Response("Bad request", { status: 400 });
  }

  let lastError = "No model worked";
  const order = goodModel ? [goodModel] : MODELS;
  for (const model of order) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { thinkingConfig: { thinkingLevel: "minimal" }, maxOutputTokens: 300 },
        }),
      }
    );
    if (r.ok) {
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      goodModel = model;
      return Response.json({ text, model });
    }
    lastError = `${model}: ${(await r.text()).slice(0, 200)}`;
    goodModel = null;
  }
  return new Response(lastError, { status: 502 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return chat(request, env);
    }
    return env.ASSETS.fetch(request);   // everything else: index.html, SKILL.md
  },
};
