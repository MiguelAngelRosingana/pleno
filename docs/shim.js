/* Pleno · puente entre la app y Supabase.
   Imita la parte de window.claude que usa la app: use("db"), use("downloads"). */
(function () {
  const cfg = window.PLENO_CONFIG || {};
  if (!cfg.url || !cfg.key || /TU_/.test(cfg.url + cfg.key)) {
    window.claude = { use: async () => null };
    return;
  }
  const sb = window.supabase.createClient(cfg.url, cfg.key);
  const cache = new Map();           // path -> data
  const subs = new Set();            // { path|prefix, cb, kind }
  let ready = null;

  const err = (e) => Object.assign(new Error((e && e.message) || "error"), { code: (e && e.code) || "unknown" });

  function notify() { subs.forEach(s => s.run()); }

  function colSnap(col) {
    const pre = col + "/";
    const docs = [];
    cache.forEach((data, path) => {
      if (path.startsWith(pre) && path.indexOf("/", pre.length) < 0)
        docs.push({ id: path.slice(pre.length), data: () => ({ ...data }) });
    });
    return { docs };
  }
  function docSnap(path) {
    const has = cache.has(path);
    return { exists: has, data: () => (has ? { ...cache.get(path) } : undefined) };
  }

  function sub(make, cb, onErr) {
    const s = { run: () => { try { cb(make()); } catch (e) { console.error(e); } } };
    subs.add(s);
    ready.then(() => s.run(), e => onErr && onErr(err(e)));
    return () => subs.delete(s);
  }

  async function write(path, data) {
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("docs").upsert({ owner: u.user.id, path, data }, { onConflict: "owner,path" });
    if (error) throw err(error);
    cache.set(path, data); notify();
  }
  async function remove(path) {
    const { error } = await sb.from("docs").delete().eq("path", path);
    if (error) throw err(error);
    cache.delete(path); notify();
  }

  const db = {
    collection: (col) => ({
      onSnapshot: (cb, onErr) => sub(() => colSnap(col), cb, onErr),
      doc: (id) => ({ set: (d) => write(col + "/" + id, d), delete: () => remove(col + "/" + id) }),
    }),
    doc: (path) => ({
      onSnapshot: (cb, onErr) => sub(() => docSnap(path), cb, onErr),
      set: (d) => write(path, d),
      delete: () => remove(path),
    }),
  };

  async function load() {
    const { data, error } = await sb.from("docs").select("path,data");
    if (error) throw err(error);
    cache.clear(); data.forEach(r => cache.set(r.path, r.data));
    sb.channel("docs-live").on("postgres_changes", { event: "*", schema: "public", table: "docs" }, (p) => {
      if (p.eventType === "DELETE") cache.delete(p.old.path);
      else cache.set(p.new.path, p.new.data);
      notify();
    }).subscribe();
  }

  function loginUI() {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:radial-gradient(600px 320px at 50% 0%,rgba(47,91,234,.22),transparent 70%),#0A0C12;font-family:Geist,system-ui,sans-serif;color:#F4F4F6;padding:16px";
      el.innerHTML = `<form style="width:100%;max-width:360px;display:grid;gap:12px;background:#121216;border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:32px 28px;box-shadow:0 24px 60px rgba(0,0,0,.5)">
        <img src="icon-192.png" width="60" height="60" alt="" style="border-radius:15px;justify-self:center;box-shadow:0 8px 24px rgba(47,91,234,.45)">
        <h1 style="margin:8px 0 0;text-align:center;font:600 30px Geist,sans-serif;letter-spacing:-.03em">BetIA</h1>
        <p style="margin:0 0 8px;text-align:center;color:#A3A3AD;font-size:14px">Tus apuestas, con datos</p>
        <input name="e" type="email" placeholder="Email" autocomplete="username" required style="padding:13px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#0E0E12;color:#F4F4F6;font:500 15px Geist,system-ui,sans-serif;outline:none">
        <input name="p" type="password" placeholder="Contraseña" autocomplete="current-password" required minlength="6" style="padding:13px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#0E0E12;color:#F4F4F6;font:500 15px Geist,system-ui,sans-serif;outline:none">
        <button style="padding:13px;border-radius:10px;border:0;background:#2F5BEA;color:#fff;font:600 15px Geist,sans-serif;cursor:pointer;margin-top:4px;box-shadow:0 8px 22px rgba(47,91,234,.4)">Entrar</button>
        <button type="button" id="su" style="background:none;border:0;color:#A3A3AD;font:500 14px Geist,sans-serif;cursor:pointer">Crear cuenta</button>
        <div id="m" style="min-height:1.2em;text-align:center;color:#FB7185;font-size:14px"></div></form>`;
      document.body.appendChild(el);
      if (document.documentElement.dataset.theme === "light") { // data-theme-login
        el.style.background = "radial-gradient(600px 320px at 50% 0%,rgba(47,91,234,.18),transparent 70%),#EAF0FA"; el.style.color = "#0E1B33";
        const fm = el.querySelector("form"); fm.style.background = "#fff"; fm.style.borderColor = "rgba(14,27,51,.1)"; fm.style.boxShadow = "0 24px 60px rgba(14,27,51,.14)";
        el.querySelectorAll("input").forEach(i => { i.style.background = "#fff"; i.style.color = "#0E1B33"; i.style.borderColor = "rgba(14,27,51,.16)"; });
        el.querySelector("p").style.color = "#4D5C78"; el.querySelector("#su").style.color = "#4D5C78";
      }
      const f = el.querySelector("form"), m = el.querySelector("#m");
      const go = async (signup) => {
        m.textContent = "";
        const c = { email: f.e.value.trim(), password: f.p.value };
        const { error } = signup ? await sb.auth.signUp(c) : await sb.auth.signInWithPassword(c);
        if (error) { m.textContent = error.message; return; }
        const { data } = await sb.auth.getSession();
        if (!data.session) { m.style.color = "#A3A3AD"; m.textContent = "Revisa tu email para confirmar la cuenta."; return; }
        el.remove(); resolve();
      };
      f.onsubmit = (e) => { e.preventDefault(); go(false); };
      el.querySelector("#su").onclick = () => f.reportValidity() && go(true);
    });
  }

  async function getDb() {
    if (!ready) {
      ready = (async () => {
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          if (document.body) await loginUI();
          else await new Promise(r => addEventListener("DOMContentLoaded", r)).then(loginUI);
        }
        await load();
      })();
    }
    await ready;
    return db;
  }

  /* ---------- IA: función "ai" de Supabase (la clave de Anthropic vive en el servidor) ---------- */
  const AI_URL = cfg.url + "/functions/v1/ai";
  let aiProbe = null;
  const aiAvailable = () => (aiProbe ||= fetch(AI_URL, { method: "OPTIONS" }).then(r => r.status !== 404).catch(() => false));

  async function aiCall(body) {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw { code: "unauthorized" };
    let r;
    try {
      r = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token, apikey: cfg.key },
        body: JSON.stringify(body),
      });
    } catch { throw { code: "network" }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: j.error || "upstream", status: r.status };
    return j;
  }

  async function toJpeg(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, "image/jpeg", 0.86));
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
    return { media_type: "image/jpeg", data: b64 };
  }

  // Misma forma que la capacidad "sample" de claude.ai: sample(prompt,{onText}), sample.json(prompt,{images}), sample.limits()
  const sample = async (prompt, opts = {}) => {
    const j = await aiCall({ prompt, web: opts.web === true, effort: opts.effort });
    if (opts.onText) opts.onText({ text: j.text });
    return { text: j.text };
  };
  sample.json = async (prompt, opts = {}) => {
    const images = [];
    for (const f of (opts.images || [])) images.push(await toJpeg(f));
    const j = await aiCall({ prompt: prompt + "\n\nResponde SOLO con un objeto JSON válido, sin texto adicional ni bloques de código.", images, web: opts.web === true, effort: opts.effort });
    const a = j.text.indexOf("{"), b = j.text.lastIndexOf("}");
    try { return JSON.parse(j.text.slice(a, b + 1)); } catch { throw { code: "invalid_json" }; }
  };
  sample.limits = async () => ({ images: { mediaTypes: ["image/jpeg", "image/png", "image/webp"] } });

  window.claude = {
    use: async (name) => {
      if (name === "db") return getDb();
      if (name === "downloads") return {
        save: async ({ filename, data }) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
          a.download = filename; document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        },
      };
      if (name === "sample") return (await aiAvailable()) ? sample : null;
      return null;
    },
    signOut: async () => { await sb.auth.signOut(); location.reload(); },
  };
})();
