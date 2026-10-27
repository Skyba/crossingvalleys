// node tools/check-links.mjs: every internal href/src/srcset in dist/ must resolve to a built file (old WordPress
// paths the Worker redirects are listed in worker/index.js and reported separately).
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
const DIST = new URL("../dist/", import.meta.url).pathname;
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") && files.push(p); });
walk(DIST);
const bad = new Map();
for (const f of files) {
  const page = "/" + f.slice(DIST.length).replace(/index\.html$/, "");
  const html = readFileSync(f, "utf8");
  const urls = [...html.matchAll(/(?:href|src)="([^"#]+)/g)].map((m) => m[1]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) urls.push(...m[1].split(",").map((s) => s.trim().split(" ")[0]));
  for (let u of urls) {
    if (/^(https?:|mailto:|data:|\/\/)/.test(u) || u === "/feed/") continue; // /feed/ is served by the Worker
    u = decodeURIComponent(new URL(u, "https://x" + page).pathname);
    const t = join(DIST, u);
    if (existsSync(t) && statSync(t).isFile()) continue;
    if (existsSync(join(t, "index.html"))) continue;
    if (!bad.has(u)) bad.set(u, page);
  }
}
for (const [u, p] of bad) console.log(`${u}  (on ${p})`);
console.log(`${files.length} pages, ${bad.size} broken internal links`);
