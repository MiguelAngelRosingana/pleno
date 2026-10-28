// Genera docs/ (lo que sirve GitHub Pages) a partir de app/index.html + web/.
const fs = require("fs"), path = require("path");
const out = path.join(__dirname, "docs");
fs.mkdirSync(out, { recursive: true });

const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0A0C12">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
<style>[hidden]{display:none!important}</style>
`;
const inject = `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
<script src="config.js"></script>
<script src="shim.js"></script>
`;
const src = fs.readFileSync(path.join(__dirname, "app", "index.html"), "utf8");
const i = src.indexOf("<script>");
fs.writeFileSync(path.join(out, "index.html"), head + src.slice(0, i) + inject + src.slice(i) + "\n</html>\n");

for (const n of ["shim.js", "config.js"]) fs.copyFileSync(path.join(__dirname, "web", n), path.join(out, n));
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
  name: "BetIA", short_name: "BetIA", start_url: ".", display: "standalone",
  background_color: "#0A0C12", theme_color: "#0A0C12",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }]
}));
console.log("OK ->", out);
