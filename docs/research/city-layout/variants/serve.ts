// Dev server for the rendered sheets: an authenticated HTTPS gallery that refreshes a sheet as soon as it is regenerated.
// Usage: bun serve.ts   (PORT, default 5190; password in ~/.secrets/citymap-dev-password, user "webber")
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const HERE = import.meta.dir;
const IMG = join(HERE, "img");
const CACHE = join(homedir(), ".cache/citymap");
const STABILITY = join(CACHE, "render");
const PORT = Number(process.env.PORT ?? 5190);
const USER = "webber";
const PASSWORD = readFileSync(join(homedir(), ".secrets/citymap-dev-password"), "utf8").trim();
const PRIVATE_FILE = join(CACHE, "private-repos");
const PRIVATE = existsSync(PRIVATE_FILE)
  ? readFileSync(PRIVATE_FILE, "utf8")
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
      .flatMap((name) => [name, name.split("/").pop()!])
  : [];
const isPublic = (name: string) => !PRIVATE.some((p) => name.toLowerCase().includes(p));
const SHEET = /^[a-z0-9._-]+\.(webp|png)$/i;

const log = (event: string, detail = "") => console.log(`[citymap-dev] ${new Date().toISOString()} ${event} ${detail}`);

function authorised(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  const given = Buffer.from(atob(header.slice(6)));
  const expected = Buffer.from(`${USER}:${PASSWORD}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface Sheet {
  name: string;
  version: number;
}
function sheets(): Sheet[] {
  return readdirSync(IMG)
    .filter((n) => SHEET.test(n) && isPublic(n))
    .sort()
    .map((name) => ({ name, version: Math.round(statSync(join(IMG, name)).mtimeMs) }));
}

// Neighbourhood sheets are named towns-<section>-<repo>; everything else is the superseded street tree.
const SECTION_TITLES: Record<string, string> = {
  towns: "Towns (plan)",
  hero: "Hero (2:1 dimetric)",
  forms: "Archetypes",
  jog: "Jogging cuts",
  land: "Land dimension",
  themes: "Themes",
  density: "Density (grain)",
  plat: "Plat films (history, moved lots in red)",
};
function grouped(list: Sheet[]): [string, Sheet[]][] {
  const groups = new Map<string, Sheet[]>();
  for (const sheet of list) {
    const m = /^towns-([a-z]+)-/.exec(sheet.name);
    const key = m ? m[1] : "superseded";
    groups.set(key, [...(groups.get(key) ?? []), sheet]);
  }
  const order = [...Object.keys(SECTION_TITLES), "superseded"];
  return [...groups].sort(([a], [b]) => ((order.indexOf(a) + 99) % 99) - ((order.indexOf(b) + 99) % 99));
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function stabilityTables(): string {
  if (!existsSync(STABILITY)) return "";
  const files = readdirSync(STABILITY)
    .filter((n) => /^stability-.*\.md$/.test(n) && isPublic(n))
    .sort();
  return files
    .map((n) => `<h3>${escape(n.slice(10, -3))}</h3><pre>${escape(readFileSync(join(STABILITY, n), "utf8"))}</pre>`)
    .join("");
}

function page(): string {
  const sections = grouped(sheets())
    .map(([key, list]) => {
      const title = SECTION_TITLES[key] ?? "Street tree (superseded)";
      const figures = list
        .map(
          (s) => `<figure><a href="/img/${s.name}?v=${s.version}" target="_blank" rel="noopener">
<img src="/img/${s.name}?v=${s.version}" data-name="${s.name}" alt="${escape(s.name.replace(/\.\w+$/, ""))} sheet" loading="lazy"></a>
<figcaption>${escape(s.name.replace(/\.\w+$/, ""))}</figcaption></figure>`,
        )
        .join("");
      const open = key === "superseded" ? "" : " open";
      return `<details${open}><summary><h2>${escape(title)} <span>${list.length}</span></h2></summary><div class="grid">${figures}</div></details>`;
    })
    .join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>citymap sheets</title><style>
:root{color-scheme:light dark;--bg:#F2EEE6;--fg:#1E1E24;--muted:#4A4A55;--card:#FFFFFF;--line:#C3BBAC;--focus:#2457A6}
@media (prefers-color-scheme:dark){:root{--bg:#1E1F29;--fg:#F8F8F2;--muted:#BFC1D0;--card:#282A36;--line:#44475A;--focus:#8BE9FD}}
body{margin:0;font:15px/1.5 "Noto Sans",system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header{padding:16px 24px;border-bottom:1px solid var(--line)}h1{margin:0;font-size:22px}header p{margin:4px 0 0;color:var(--muted)}
main{padding:8px 24px 48px}summary{cursor:pointer;list-style:none}summary h2{display:inline;font-size:18px}summary span{color:var(--muted);font-weight:400}
details{margin:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;margin-top:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:6px;overflow:hidden}
figure img{display:block;width:100%;height:auto}figcaption{padding:6px 10px;color:var(--muted);font-size:13px}
a:focus-visible,summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
pre{background:var(--card);border:1px solid var(--line);padding:12px;overflow:auto;font-size:13px}
.fresh{animation:fresh 1.2s ease-out}@keyframes fresh{from{box-shadow:0 0 0 4px var(--focus)}to{box-shadow:none}}
@media (prefers-reduced-motion:reduce){.fresh{animation:none}}
</style></head><body><header><h1>citymap sheets</h1><p>Sheets refresh by themselves when they are regenerated. Select a sheet to open it at full size.</p></header>
<main>${sections}<section><h2>Stability</h2>${stabilityTables() || "<p>No stability runs yet.</p>"}</section></main>
<script>
let known = Object.fromEntries([...document.querySelectorAll("img[data-name]")].map(i => [i.dataset.name, i.src.split("v=")[1]]));
setInterval(async () => {
  const r = await fetch("/api/sheets"); if (!r.ok) return;
  const list = await r.json();
  if (list.some(s => !(s.name in known))) return location.reload();
  for (const s of list) if (String(s.version) !== known[s.name]) {
    known[s.name] = String(s.version);
    const img = document.querySelector('img[data-name="' + s.name + '"]');
    img.src = "/img/" + s.name + "?v=" + s.version; img.parentElement.href = img.src;
    img.closest("figure").classList.remove("fresh"); void img.offsetWidth; img.closest("figure").classList.add("fresh");
  }
}, 2000);
</script></body></html>`;
}

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  tls: {
    cert: Bun.file(join(CACHE, "certs/dev.pem")),
    key: Bun.file(join(CACHE, "certs/dev-key.pem")),
  },
  fetch(request) {
    const url = new URL(request.url);
    if (!authorised(request)) {
      log("auth-refused", url.pathname);
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="citymap", charset="UTF-8"' },
      });
    }
    if (url.pathname === "/") return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (url.pathname === "/api/sheets") return Response.json(sheets());
    if (url.pathname.startsWith("/img/")) {
      const name = decodeURIComponent(url.pathname.slice(5));
      if (!SHEET.test(name) || !isPublic(name) || !existsSync(join(IMG, name))) {
        log("not-found", name);
        return new Response("Not found", { status: 404 });
      }
      return new Response(Bun.file(join(IMG, name)), { headers: { "Cache-Control": "no-cache" } });
    }
    log("not-found", url.pathname);
    return new Response("Not found", { status: 404 });
  },
});
log("listening", `https://127.0.0.1:${PORT} sheets=${sheets().length}`);
