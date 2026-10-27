// crossingvalleys.com Worker. Runs before the static assets for every request: serves the comments API and
// its admin page (comments.js), keeps the old WordPress URLs working
// (/feed/, ?p=<id>, /wp-content/uploads/..., attachment pages and renamed pages, all as 301s), redirects www and http, and in the
// staging environment (env.STAGING, cv.basilev.com, unlisted) marks every response noindex.
import ids from "./ids.json";
import uploads from "./uploads.json";
import attachments from "./attachments.json";
import * as comments from "./comments.js";

const UNLISTED = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai",
  "Referrer-Policy": "no-referrer",
};
const MOVED = {
  "/portfolio/italy/": "/portfolio/cycling-italy/",
  "/portfolio/greece/": "/portfolio/cycling-through-greece/",
  "/portfolio/croatia-and-bosnia/": "/portfolio/cycling-croatia-and-bosnia/",
  "/portfolio/montenegro-albania-macedonia/": "/portfolio/cycling-montenegro-albania-macedonia/",
  "/travel-itinerary/": "/trip/travel-itinerary/",
  "/questions-answers/": "/trip/questions-answers/",
  "/home/": "/",
  "/category/uncategorized/": "/blog/",
};

function redirect(url, path) {
  return Response.redirect(new URL(path, url.origin).href, 301);
}

async function route(request, env, url) {
  const path = url.pathname;
  if (path === "/api/comments") return request.method === "POST" ? comments.create(request, env) : comments.list(env, url);
  if (path === "/admin" || path.startsWith("/admin/")) return comments.admin(request, env, url);
  const id = url.searchParams.get("p") || url.searchParams.get("page_id") || url.searchParams.get("portfolio");
  if (path === "/" && id && ids[id]) return redirect(url, ids[id]);
  if (path === "/" && url.searchParams.has("s")) return Response.redirect(`https://duckduckgo.com/?sites=crossingvalleys.com&q=${encodeURIComponent(url.searchParams.get("s"))}`, 302);
  if (path === "/feed/" || path === "/feed") {
    const res = await env.ASSETS.fetch(new URL("/feed.xml", url.origin));
    return new Response(res.body, { status: res.status, headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
  }
  // Per-post, category and comment feeds of WordPress all fall back to the main feed.
  if (/\/feed\/?$/.test(path) || path.startsWith("/comments/feed")) return redirect(url, "/feed/");
  if (path.startsWith("/wp-content/uploads/")) {
    const rel = decodeURIComponent(path.slice("/wp-content/uploads/".length));
    const to = uploads[rel] || uploads[rel.replace(/-\d+x\d+(\.\w+)$/, "$1")];
    if (to && to !== path) return redirect(url, to);
  }
  const slash = path.endsWith("/") ? path : path + "/";
  if (MOVED[slash]) return redirect(url, MOVED[slash]);
  if (attachments[slash]) return redirect(url, attachments[slash]);
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:" && url.hostname !== "localhost") return Response.redirect(`https://${url.hostname.replace(/^www\./, "")}${url.pathname}${url.search}`, 301);
    if (url.hostname.startsWith("www.")) return Response.redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301);
    if (!env.STAGING) return route(request, env, url);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain", ...UNLISTED } });
    const res = await route(request, env, url);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(UNLISTED)) out.headers.set(k, v);
    return out;
  },
};
