// BetIA · función "ai": puente seguro entre la web y la API de Claude.
// La clave de Anthropic vive solo aquí (secreto ANTHROPIC_API_KEY); la web nunca la ve.
// Solo responde a usuarios con sesión iniciada en tu proyecto (y, si defines ALLOWED_EMAIL, solo a ese email).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Modelo por defecto. Para gastar la mitad, define el secreto ANTHROPIC_MODEL=claude-sonnet-5-5
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-opus-5-5";

const SYSTEM = `Eres BetIA, el analista de la libreta de apuestas deportivas de Miguel (Madrid, España). Responde siempre en español de España.
Sé honesto y responsable: el margen de las casas (aprox. 6 %) hace negativa la esperanza a largo plazo, sobre todo en combinadas largas. No prometas ganancias, no inventes datos y avisa cuando la muestra sea pequeña. En sus casas (Winamax, Sportium) la cuota mínima por selección es 1,10.`;

const IMG_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "not_configured" }, 503);

  // Solo usuarios con sesión en este proyecto
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const only = Deno.env.get("ALLOWED_EMAIL");
  if (only && user.email?.toLowerCase() !== only.toLowerCase()) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!prompt || prompt.length > 80_000) return json({ error: "bad_request" }, 400);
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  for (const i of images) {
    if (!IMG_OK.includes(i?.media_type) || typeof i?.data !== "string" || i.data.length > 7_000_000) {
      return json({ error: "bad_image" }, 400);
    }
  }
  const web = body.web === true;
  const effort = ["low", "medium", "high"].includes(body.effort) ? body.effort : "medium";

  const client = new Anthropic({ apiKey });
  const messages: any[] = [{
    role: "user",
    content: [
      ...images.map((i: any) => ({ type: "image", source: { type: "base64", media_type: i.media_type, data: i.data } })),
      { type: "text", text: prompt },
    ],
  }];
  const params: any = {
    model: MODEL,
    max_tokens: web ? 14000 : 8000,
    system: SYSTEM,
    output_config: { effort },
    messages,
    ...(web
      ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country: "ES", timezone: "Europe/Madrid" } }] }
      : {}),
  };

  // Con reserva automática ante un rechazo del clasificador de seguridad; si la API no la admite, se repite sin ella.
  const create = async (p: any) => {
    try {
      return await (client.beta.messages as any).create({ ...p, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (e: any) {
      if (e?.status === 400) return await client.messages.create(p);
      throw e;
    }
  };

  try {
    let resp: any = await create(params);
    for (let n = 0; n < 4 && resp.stop_reason === "pause_turn"; n++) {
      messages.push({ role: "assistant", content: resp.content });
      resp = await create({ ...params, messages });
    }
    if (resp.stop_reason === "refusal") return json({ error: "refusal" }, 422);
    const text = (resp.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return json({ text, usage: resp.usage });
  } catch (e: any) {
    const status = e?.status;
    if (status === 429) return json({ error: "rate_limited" }, 429);
    if (status === 529 || status === 503) return json({ error: "overloaded" }, 503);
    if (status === 401 || status === 403) return json({ error: "bad_api_key" }, 502);
    return json({ error: "upstream", detail: String(e?.message ?? e).slice(0, 300) }, 502);
  }
});
