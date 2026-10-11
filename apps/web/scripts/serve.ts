// Serves the viewer's static export over HTTPS with basic auth, as every local service is.
// Usage: bun scripts/serve.ts   (PORT, default 5192; user "webber"; password from CITYMAP_WEB_PASSWORD or
// ~/.secrets/citymap-dev-password; certificate from ~/.cache/citymap/certs)
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../out");
const port = Number(process.env.PORT ?? 5192);
const password = (
  process.env.CITYMAP_WEB_PASSWORD ?? readFileSync(join(homedir(), ".secrets/citymap-dev-password"), "utf8")
).trim();
const expected = `Basic ${Buffer.from(`webber:${password}`).toString("base64")}`;
const certs = join(homedir(), ".cache/citymap/certs");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};

Bun.serve({
  port,
  hostname: "127.0.0.1",
  tls: { cert: Bun.file(join(certs, "dev.pem")), key: Bun.file(join(certs, "dev-key.pem")) },
  fetch(request) {
    if (request.headers.get("authorization") !== expected) {
      console.log(`[serve] 401 ${new URL(request.url).pathname}`);
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="citymap"' },
      });
    }
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    // Paths stay inside the export: normalise, then refuse anything that climbs out.
    const relative = normalize(pathname).replace(/^(\.\.(\/|$))+/, "");
    let file = join(root, relative);
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 });
    if (existsSync(join(file, "index.html"))) file = join(file, "index.html");
    else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) return new Response("Not found", { status: 404 });
    return new Response(Bun.file(file), {
      headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" },
    });
  },
});
console.log(`[serve] https://127.0.0.1:${port} serving ${root}`);
