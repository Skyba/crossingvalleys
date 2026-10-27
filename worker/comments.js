// Comments written on the site, in D1 (binding DB). They publish immediately; spam is kept out by a hidden trap
// field, a minimum time on the page, a link limit and a per-visitor rate limit. Basile deletes bad ones at /admin/
// (HTTP Basic auth, password in the ADMIN_PASSWORD secret, from 1Password Dev/crossingvalleys-admin).
import ids from "./ids.json";

const PAGES = new Set(Object.values(ids));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function list(env, url) {
  const page = url.searchParams.get("page") || "";
  const { results } = await env.DB.prepare("SELECT id, parent, author, url, body, created FROM comments WHERE page = ? ORDER BY created, id").bind(page).all();
  return json(results);
}

export async function create(request, env) {
  let f;
  try { f = await request.json(); } catch { return json({ error: "Could not read the comment." }, 400); }
  const author = String(f.author || "").trim().slice(0, 80);
  const body = String(f.body || "").replace(/\r\n/g, "\n").trim();
  const site = String(f.url || "").trim().slice(0, 200);
  const page = String(f.page || "");
  const parent = /^(n?\d{1,9})$/.test(String(f.parent || "")) ? String(f.parent) : null;
  if (f.website) return json({ error: "Comment refused." }, 400); // the hidden trap field: only bots fill it
  if (!PAGES.has(page)) return json({ error: "Unknown page." }, 400);
  if (!author) return json({ error: "Please give your name." }, 400);
  if (body.length < 2 || body.length > 5000) return json({ error: "A comment is between 2 and 5,000 characters." }, 400);
  if (site && !/^https?:\/\/[^\s]+$/i.test(site)) return json({ error: "The website must start with http:// or https://." }, 400);
  if ((body.match(/https?:\/\//gi) || []).length > 2) return json({ error: "Too many links in one comment." }, 400);
  if (!(Date.now() - Number(f.t) > 3000)) return json({ error: "That was fast. Please try again in a few seconds." }, 400);
  const ip = await sha256((request.headers.get("cf-connecting-ip") || "") + (env.ADMIN_PASSWORD || ""));
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE ip = ? AND created > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')").bind(ip).first("n");
  if (recent >= 5) return json({ error: "Too many comments in a short time. Please wait a few minutes." }, 429);
  const row = await env.DB.prepare("INSERT INTO comments (page, parent, author, url, body, ip) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, parent, author, url, body, created")
    .bind(page, parent, author, site || null, body, ip).first();
  return json(row, 201);
}

function authorized(request, env) {
  const h = request.headers.get("authorization") || "";
  if (!env.ADMIN_PASSWORD || !h.startsWith("Basic ")) return false;
  const [, pass = ""] = atob(h.slice(6)).split(/:(.*)/s);
  const a = new TextEncoder().encode(pass), b = new TextEncoder().encode(env.ADMIN_PASSWORD);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function admin(request, env, url) {
  if (!authorized(request, env)) return new Response("Login required", { status: 401, headers: { "www-authenticate": 'Basic realm="crossingvalleys admin"' } });
  const del = url.pathname.match(/^\/admin\/delete\/(\d+)\/?$/);
  if (del && request.method === "POST") {
    await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(Number(del[1])).run();
    return Response.redirect(new URL("/admin/", url).href, 303);
  }
  const { results } = await env.DB.prepare("SELECT id, page, parent, author, url, body, created FROM comments ORDER BY created DESC, id DESC LIMIT 500").all();
  const rows = results.map((c) => `<li><p><b>${esc(c.author)}</b>${c.url ? ` · ${esc(c.url)}` : ""} · ${esc(c.created.replace("T", " ").slice(0, 16))} UTC · <a href="${esc(c.page)}#comment-n${c.id}">${esc(c.page)}</a></p><p>${esc(c.body).replace(/\n/g, "<br>")}</p><form method="post" action="/admin/delete/${c.id}/" onsubmit="return confirm('Delete this comment?')"><button>Delete</button></form></li>`).join("");
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Comments – crossingvalleys</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:2em auto;padding:0 16px;color:#333}li{border-bottom:1px solid #ddd;padding:12px 0;list-style:none}ul{padding:0}p{margin:4px 0}button{background:#b33;color:#fff;border:0;padding:6px 12px;border-radius:3px;cursor:pointer}a{color:#2b7557}</style>
<h1>Comments written on the site (${results.length})</h1><p>They are public as soon as they are posted. Deleting one removes it for good. The WordPress-era comments are part of the site's files, not listed here.</p><ul>${rows || "<li>None yet.</li>"}</ul>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
