// Cloudflare Pages Function: POST /api/chat
// Keeps GEMINI_API_KEY on the server so it never appears in the web page or on GitHub.
const MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3-flash-preview"];

export async function onRequestPost({ request, env }) {
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
  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
      }
    );
    if (r.ok) {
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      return Response.json({ text, model });
    }
    lastError = `${model}: ${(await r.text()).slice(0, 200)}`;
  }
  return new Response(lastError, { status: 502 });
}
