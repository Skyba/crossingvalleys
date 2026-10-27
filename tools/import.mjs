// One-off import of the WordPress backup into content/ (see AGENTS.md). Re-runnable: images already written are skipped,
// text files are rewritten. Reads only the backup folder, never the live site (the YouTube thumbnails and comment
// avatars are fetched once from YouTube and Gravatar).
//   node tools/import.mjs [backupDir]
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { parse } from "node-html-parser";
import sharp from "sharp";
import YAML from "yaml";

const BK = process.argv[2] || `${process.env.HOME}/OneDrive/cowork/basilev.com/backups/2026-10-26/crossingvalleys.com`;
const ROOT = new URL("..", import.meta.url).pathname;
const CONTENT = join(ROOT, "content");
const PUBLIC = join(ROOT, "public");
const FULL = 2000, MEDIUM = 1040, SQUARE = 600;

const json = (f) => JSON.parse(readFileSync(join(BK, "json", f), "utf8"));
const html = (f) => readFileSync(join(BK, f), "utf8");
const posts = json("posts.json"), pages = json("pages.json"), media = json("media.json");
const categories = Object.fromEntries(json("categories.json").map((c) => [c.id, c]));
const tags = Object.fromEntries(json("tags.json").map((t) => [t.id, t]));
const comments = json("comments.json");
const mediaUrl = Object.fromEntries(media.map((m) => [m.id, m.source_url]));
const text = (h) => parse(`<p>${h}</p>`).text.trim();
const missing = new Set();
const uploadMap = {}; // old /wp-content/uploads/<rel> -> new public path, for the Worker's redirects
const ids = {}; // WordPress post/page id -> path, for old ?p= and ?page_id= links

// Old slugs WordPress still redirected, and links written before pages moved under /trip/.
const OLD_PATHS = {
  "/portfolio/italy/": "/portfolio/cycling-italy/",
  "/portfolio/greece/": "/portfolio/cycling-through-greece/",
  "/portfolio/croatia-and-bosnia/": "/portfolio/cycling-croatia-and-bosnia/",
  "/portfolio/montenegro-albania-macedonia/": "/portfolio/cycling-montenegro-albania-macedonia/",
  "/travel-itinerary/": "/trip/travel-itinerary/",
  "/questions-answers/": "/trip/questions-answers/",
};

async function get(url) {
  for (let i = 0; ; i++) {
    try { return await fetch(url); } catch (e) { if (i === 3) throw e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
}

// ---------- images ----------
function original(url) {
  const m = url.match(/\/wp-content\/uploads\/([^?#"]+)/);
  if (!m) return null;
  const rel = decodeURIComponent(m[1]);
  for (const r of [rel.replace(/-\d+x\d+(\.\w+)$/, "$1"), rel]) {
    for (const dir of ["uploads", "media"]) {
      const p = join(BK, dir, r);
      if (existsSync(p)) return { path: p, rel: r };
    }
  }
  missing.add(rel);
  return null;
}

const outName = (p) => {
  const ext = extname(p).toLowerCase().replace(".jpeg", ".jpg");
  return basename(p, extname(p)) + ext;
};
const variant = (name, suffix) => name.replace(/(\.\w+)$/, `-${suffix}$1`);

async function write(src, dest, resize) {
  if (existsSync(dest)) return;
  const ext = extname(dest);
  if (ext === ".gif") return copyFileSync(src, dest);
  let s = sharp(src, { failOn: "none" }).rotate().resize(resize);
  s = ext === ".png" ? s.png({ compressionLevel: 9, effort: 8 }) : ext === ".webp" ? s.webp({ quality: 80 }) : s.jpeg({ quality: 80, mozjpeg: true });
  await s.toFile(dest);
}

const imgCache = new Map();
// Copies one upload into dir as <name> (2000 px max), <name>-m (1040 px wide max, unless medium is false) and, with square,
// <name>-sq (600x600 crop).
// Returns { name, w, h } of the full-size file, or null when the backup lacks it.
async function image(url, dir, publicDir, { square = false, medium = true } = {}) {
  const o = original(url);
  if (!o) return null;
  const name = outName(o.path);
  mkdirSync(dir, { recursive: true });
  const full = join(dir, name);
  await write(o.path, full, { width: FULL, height: FULL, fit: "inside", withoutEnlargement: true });
  if (extname(name) !== ".gif") {
    if (medium) await write(o.path, join(dir, variant(name, "m")), { width: MEDIUM, fit: "inside", withoutEnlargement: true });
    if (square) await write(o.path, join(dir, variant(name, "sq")), { width: SQUARE, height: SQUARE, fit: "cover", position: "centre" });
  }
  const key = full;
  if (!imgCache.has(key)) {
    const m = await sharp(full).metadata();
    imgCache.set(key, { name, w: m.width, h: m.height });
  }
  uploadMap[o.rel] ??= publicDir + name;
  return imgCache.get(key);
}

async function youtubeThumb(id, dir) {
  const dest = join(dir, `youtube-${id}.jpg`);
  if (existsSync(dest)) return basename(dest);
  mkdirSync(dir, { recursive: true });
  for (const q of ["maxresdefault", "sddefault", "hqdefault"]) {
    const r = await get(`https://i.ytimg.com/vi/${id}/${q}.jpg`);
    if (r.ok) {
      await sharp(Buffer.from(await r.arrayBuffer())).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toFile(dest);
      return basename(dest);
    }
  }
  throw new Error(`no YouTube thumbnail for ${id}`);
}

// ---------- HTML bodies ----------
const localPath = (href) => {
  const u = new URL(href, "https://crossingvalleys.com");
  let p = u.pathname.endsWith("/") || extname(u.pathname) ? u.pathname : u.pathname + "/";
  p = OLD_PATHS[p] || p;
  return p + u.search + u.hash;
};
const isSite = (href) => /^(https?:)?\/\/(www\.)?crossingvalleys\.com(\/|$)/.test(href || "");

const youtubeId = (src) => (src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/) || [])[1];
const facade = (id, thumb, title = "") =>
  `<div class="cv-youtube videofit video-container" data-youtube="${id}"><button type="button" class="cv-youtube-play" aria-label="Play video${title ? ": " + title.replace(/"/g, "&quot;") : ""}"><img src="${thumb}" alt="" loading="lazy"><span class="cv-youtube-icon"></span></button></div>`;

// Rewrites a WordPress body for its new folder: uploads become local web-sized files, site links become relative,
// YouTube iframes become click-to-load, WordPress post embeds (iframe half) are dropped, the Google Map loads lazily.
async function body(src, dir, publicDir) {
  const root = parse(src, { comment: true });
  for (const iframe of root.querySelectorAll("iframe")) {
    const s = iframe.getAttribute("src") || "";
    const id = youtubeId(s);
    if (iframe.classList.contains("wp-embedded-content")) {
      const p = iframe.parentNode;
      iframe.remove();
      if (p.tagName === "P" && !p.innerHTML.trim()) p.remove();
    } else if (id) {
      iframe.replaceWith(facade(id, await youtubeThumb(id, dir), iframe.getAttribute("title") || ""));
    } else {
      iframe.setAttribute("loading", "lazy");
    }
  }
  for (const img of root.querySelectorAll("img")) {
    const s = img.getAttribute("src") || "";
    if (!s.includes("/wp-content/uploads/")) continue;
    const r = await image(s, dir, publicDir);
    img.removeAttribute("srcset");
    if (!r) continue;
    const ext = extname(r.name);
    if (ext === ".gif" || r.w <= MEDIUM) img.setAttribute("src", r.name);
    else {
      img.setAttribute("src", variant(r.name, "m"));
      img.setAttribute("srcset", `${variant(r.name, "m")} ${Math.min(MEDIUM, r.w)}w, ${r.name} ${r.w}w`);
    }
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
  }
  for (const a of root.querySelectorAll("a")) {
    const h = a.getAttribute("href") || "";
    if (h.includes("/wp-content/uploads/") && isSite(h)) {
      const r = await image(h, dir, publicDir);
      if (r) a.setAttribute("href", r.name);
    } else if (isSite(h)) a.setAttribute("href", localPath(h));
  }
  return root.toString().trim();
}

const front = (data, bodyHtml) => `---\n${YAML.stringify(data, { lineWidth: 0 }).trim()}\n---\n${bodyHtml}\n`;

// ---------- comments ----------
const avatars = new Map();
const MISSES = join(ROOT, "tools/gravatar-misses.json"); // hashes Gravatar has no picture for: shown with the default avatar
const misses = new Set(existsSync(MISSES) ? JSON.parse(readFileSync(MISSES, "utf8")) : []);
async function avatar(urls) {
  const u = urls?.["96"] || "";
  const hash = (u.match(/avatar\/([0-9a-f]{32})/) || [])[1];
  if (!hash) return "default";
  if (avatars.has(hash)) return avatars.get(hash);
  const dir = join(PUBLIC, "avatars");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${hash}.jpg`);
  let name = misses.has(hash) ? "default" : hash;
  if (!existsSync(dest) && name !== "default") {
    const r = await get(`https://secure.gravatar.com/avatar/${hash}?s=120&d=404&r=g`);
    if (r.ok) await sharp(Buffer.from(await r.arrayBuffer())).resize(120, 120).jpeg({ quality: 80 }).toFile(dest);
    else { misses.add(hash); name = "default"; }
  }
  avatars.set(hash, name);
  return name;
}

async function commentsFor(postId) {
  const list = comments.filter((c) => c.post === postId).sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  for (const c of list) {
    out.push({
      id: c.id, parent: c.parent, author: text(c.author_name), url: c.author_url || "", date: c.date,
      avatar: await avatar(c.author_avatar_urls),
      html: parse(c.content.rendered).toString().trim(),
    });
  }
  return out;
}

// ---------- listings: how each post appears in the blog loop (from the rendered blog pages) ----------
const loops = ["html/blog.html", ...[2, 3, 4, 5].map((n) => `supplement/blog-page-${n}.html`)].map((f) => parse(html(f)));
const loopEntry = {};
for (const doc of loops) {
  for (const art of doc.querySelectorAll("article.kad_blog_item")) {
    const id = Number(art.id.replace("post-", ""));
    const img = art.querySelector("img");
    const excerpt = art.querySelector(".entry-content");
    for (const a of excerpt?.querySelectorAll("a") || []) if (isSite(a.getAttribute("href"))) a.setAttribute("href", localPath(a.getAttribute("href")));
    let type = "text";
    if (art.querySelector(".kt-slickslider")) type = "slider";
    else if (art.querySelector(".videofit iframe")) type = "video";
    else if (art.querySelector(".videofit")) type = "text"; // a video post whose video field was left empty
    else if (art.querySelector(".post-land-image-container")) type = "landscape";
    else if (img) type = "portrait";
    const video = type === "video" ? youtubeId(art.querySelector(".videofit iframe").getAttribute("src")) : undefined;
    loopEntry[id] = { type, video, excerpt: excerpt ? excerpt.innerHTML.trim() : "" };
  }
}

const htmlFile = (link) => {
  const p = new URL(link).pathname.replace(/^\/|\/$/g, "");
  return `html/${p ? p.replace(/\//g, "__") : "index"}.html`;
};

// ---------- posts ----------
async function importPosts() {
  for (const p of posts) {
    const date = p.date.slice(0, 10);
    const folder = `${date}-${p.slug}`;
    const dir = join(CONTENT, "posts", folder);
    const publicDir = `/${date.replace(/-/g, "/")}/${p.slug}/`;
    const doc = parse(html(htmlFile(p.link)));
    const feat = doc.querySelector(".postfeat");
    const data = {
      id: p.id, title: text(p.title.rendered), date: p.date, modified: p.modified, slug: p.slug,
      categories: p.categories.map((c) => categories[c].slug),
      tags: p.tags.map((t) => tags[t].slug),
      format: p.format,
    };
    // Header media on the post page.
    if (feat?.querySelector(".kt-slickslider")) {
      const images = [];
      for (const a of feat.querySelectorAll("a[data-rel=lightbox]")) {
        const r = await image(a.getAttribute("href"), dir, publicDir, { square: true });
        if (r) images.push(r.name);
      }
      data.header = { type: "slider", images };
    } else if (feat?.querySelector("iframe")) {
      const id = youtubeId(feat.querySelector("iframe").getAttribute("src"));
      data.header = { type: "video", youtube: id, title: feat.querySelector("iframe").getAttribute("title") || "" };
      await youtubeThumb(id, dir);
    } else if (feat?.querySelector("img")) {
      const im = feat.querySelector("img");
      const r = await image(feat.querySelector("a")?.getAttribute("href") || im.getAttribute("src"), dir, publicDir, { square: true });
      if (r) data.header = { type: "image", image: r.name, width: Number(im.getAttribute("width")), height: Number(im.getAttribute("height")) };
    }
    // Featured image (listings, carousels, sidebar thumbnails).
    if (p.featured_media && mediaUrl[p.featured_media]) {
      const r = await image(mediaUrl[p.featured_media], dir, publicDir, { square: true });
      if (r) data.featured = r.name;
    }
    const loop = loopEntry[p.id];
    data.listing = loop.type;
    if (loop.type === "slider" && data.header?.type !== "slider") throw new Error(`slider listing without slider header: ${p.slug}`);
    if (loop.video) {
      data.listingVideo = loop.video;
      await youtubeThumb(loop.video, dir);
    }
    data.excerpt = loop.excerpt;
    const b = await body(p.content.rendered, dir, publicDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), front(data, b));
    const cs = await commentsFor(p.id);
    if (cs.length) writeFileSync(join(dir, "comments.json"), JSON.stringify(cs, null, 1) + "\n");
    ids[p.id] = publicDir;
    console.log("post", folder, data.header?.type || "-", data.listing, cs.length ? `${cs.length} comments` : "");
  }
}

// ---------- pages ----------
async function importPages() {
  for (const p of pages) {
    const path = new URL(p.link).pathname;
    const folder = path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/\//g, "--");
    const dir = join(CONTENT, "pages", folder);
    const doc = parse(html(htmlFile(p.link)));
    const data = {
      id: p.id, title: text(p.title.rendered), path, date: p.date, modified: p.modified,
      template: (p.template || "default").replace(/^template-|\.php$/g, ""),
      sidebar: !!doc.querySelector(".main.kt-sidebar"),
    };
    let b = await body(p.content.rendered, dir, path);
    if (p.slug === "instagram") b = ""; // the feed is rendered from data/instagram.json
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), front(data, b));
    const cs = await commentsFor(p.id);
    if (cs.length) writeFileSync(join(dir, "comments.json"), JSON.stringify(cs, null, 1) + "\n");
    ids[p.id] = path;
    console.log("page", path, data.template, data.sidebar ? "sidebar" : "", cs.length ? `${cs.length} comments` : "");
  }
}

// ---------- portfolio (country galleries) ----------
async function importPortfolio() {
  const grid = [parse(html("html/photography.html")), parse(html("supplement/photography-page-2.html"))];
  let order = 0;
  const types = {};
  for (const doc of grid) {
    for (const item of doc.querySelectorAll(".portfolio_item")) {
      const slug = new URL(item.querySelector("a.portfolio-poststyle-link").getAttribute("href")).pathname.split("/")[2];
      const names = item.querySelector(".portfolio-loop-types").text.split("|").map((t) => t.trim()).filter(Boolean);
      types[slug] = { order: ++order, names, card: item.querySelector("a.portfolio_lightbox").getAttribute("href") };
    }
  }
  for (const [slug, info] of Object.entries(types)) {
    const doc = parse(html(`supplement/${slug}.html`));
    const dir = join(CONTENT, "portfolio", slug);
    const publicDir = `/portfolio/${slug}/`;
    const art = doc.querySelector("article.portfolio");
    const images = [];
    // Most galleries are a square grid (.kad-wp-gallery); the departure day is a four-image collage (.kad_post_grid).
    const collage = !!art.querySelector(".kad_post_grid");
    for (const a of art.querySelectorAll(".postfeat a[data-rel=lightbox]")) {
      const r = await image(a.getAttribute("href"), dir, publicDir, { square: true, medium: false });
      if (r) images.push(r.name);
    }
    const card = info.card ? await image(info.card, dir, publicDir, { square: true }) : null;
    const slugs = (art.getAttribute("class").match(/portfolio-type-[\w-]+/g) || []).map((c) => c.slice(15));
    if (slugs.length !== info.names.length) throw new Error(`portfolio types of ${slug}: ${slugs} vs ${info.names}`);
    const data = {
      id: Number((art.getAttribute("class").match(/post-(\d+)/) || [])[1]),
      title: doc.querySelector("h1.post_head_title, h1.entry-title").text.trim(),
      order: info.order,
      types: slugs.map((s, i) => ({ slug: s, name: info.names[i] })),
      featured: card?.name || images[0],
      ...(collage ? { layout: "collage" } : {}),
      images,
    };
    const b = await body(art.querySelector(".portfolio-content .entry-content")?.innerHTML || "", dir, publicDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), front(data, b));
    ids[data.id] = publicDir;
    console.log("portfolio", slug, images.length, "images");
  }
}

// ---------- site-wide assets and the frozen Instagram feeds ----------
async function importSite() {
  const assets = join(PUBLIC, "assets");
  for (const u of ["2017/02/ascend_logo-min-2.png", "2017/02/trans_logo-min-2.png"]) {
    const dest = join(assets, basename(u));
    mkdirSync(assets, { recursive: true });
    if (!existsSync(dest)) await sharp(join(BK, "uploads", u)).resize(128, 128).png({ compressionLevel: 9 }).toFile(dest);
  }
  await image("/wp-content/uploads/2018/01/bikepacking-iran-frontcover.jpg", assets, "/assets/");
  await youtubeThumb("95SvVZg4VAw", assets);

  const insta = join(PUBLIC, "instagram");
  mkdirSync(insta, { recursive: true });
  const feed = (doc) => doc.querySelectorAll(".sbi_item").map((it) => {
    const a = it.querySelector("a.sbi_photo");
    const file = (a.getAttribute("data-full-res").match(/\/([^/?]+)\?/) || [])[1]?.replace(/\.jpg$/, "");
    return { href: a.getAttribute("href"), type: it.classList.contains("sbi_type_video") ? "video" : it.classList.contains("sbi_type_carousel") ? "carousel" : "image", alt: it.querySelector("img")?.getAttribute("alt") || "", file };
  });
  const sidebar = feed(parse(html("html/2018__08__27__finally-at-destination.html")));
  const page = feed(parse(html("html/photography__instagram.html")));
  for (const it of [...sidebar, ...page]) {
    const src = join(BK, "uploads/sb-instagram-feed-images", `${it.file}full.jpg`);
    const dest = join(insta, `${it.file.replace(/\.webp$/, "")}.jpg`);
    if (existsSync(src) && !existsSync(dest)) await sharp(src).resize(640, 640, { fit: "cover" }).jpeg({ quality: 78, mozjpeg: true }).toFile(dest);
    if (!existsSync(src)) missing.add(`instagram ${it.file}`);
    it.image = `/instagram/${it.file.replace(/\.webp$/, "")}.jpg`;
    delete it.file;
  }
  const avatarSrc = join(BK, "uploads/sb-instagram-feed-images/basileslife.jpg");
  if (!existsSync(join(insta, "basileslife.jpg"))) await sharp(avatarSrc).resize(100, 100).jpeg({ quality: 80 }).toFile(join(insta, "basileslife.jpg"));
  mkdirSync(join(ROOT, "src/data"), { recursive: true });
  writeFileSync(join(ROOT, "src/data/instagram.json"), JSON.stringify({ account: "basileslife", sidebar, page }, null, 1) + "\n");
}

await importSite();
await importPosts();
await importPages();
await importPortfolio();
writeFileSync(MISSES, JSON.stringify([...misses].sort(), null, 1) + "\n");
// WordPress gave every upload its own "attachment page": send each to the page it was attached to, else to the image.
const attachments = {};
for (const m of media) {
  const from = new URL(m.link).pathname;
  const rel = (m.source_url.match(/\/wp-content\/uploads\/(.+)$/) || [])[1];
  const to = ids[m.post] || (rel && uploadMap[decodeURIComponent(rel)]);
  if (to && from !== to) attachments[from] = to;
}
writeFileSync(join(ROOT, "worker/attachments.json"), JSON.stringify(attachments) + "\n");
writeFileSync(join(ROOT, "worker/ids.json"), JSON.stringify(ids) + "\n");
writeFileSync(join(ROOT, "worker/uploads.json"), JSON.stringify(Object.fromEntries(Object.entries(uploadMap).sort()), null, 0) + "\n");
if (missing.size) console.log("missing from the backup:", [...missing]);
