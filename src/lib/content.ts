// Reads content/ at build time. A post, page or gallery is a folder holding index.html (YAML frontmatter + HTML body),
// its images beside it, and optionally comments.json. The images are copied next to the built page by
// src/integrations/content-files.mjs, so bodies reference them by bare filename.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const ROOT = join(process.cwd(), "content");

export type Comment = { id: number; parent: number; author: string; url: string; date: string; avatar: string; html: string };
export type Post = {
  id: number; title: string; date: string; modified: string; slug: string; categories: string[]; tags: string[];
  format: string; header?: { type: "image" | "slider" | "video"; image?: string; width?: number; height?: number; images?: string[]; youtube?: string; title?: string };
  featured?: string; listing: "landscape" | "portrait" | "slider" | "video" | "text"; listingVideo?: string; excerpt: string;
  body: string; comments: Comment[]; url: string; folder: string; draft?: boolean;
};
export type Page = { id: number; title: string; path: string; template: string; sidebar: boolean; body: string; comments: Comment[]; folder: string; date: string; modified: string };
export type Gallery = { id: number; title: string; order: number; layout?: "collage"; types: { slug: string; name: string }[]; featured: string; images: string[]; body: string; slug: string; url: string; folder: string };

function read(dir: string) {
  const src = readFileSync(join(dir, "index.html"), "utf8");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`no frontmatter in ${dir}`);
  const comments = existsSync(join(dir, "comments.json")) ? JSON.parse(readFileSync(join(dir, "comments.json"), "utf8")) : [];
  return { ...YAML.parse(m[1]), body: m[2].trim(), comments };
}

const folders = (kind: string) => (existsSync(join(ROOT, kind)) ? readdirSync(join(ROOT, kind), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

export const postUrl = (date: string, slug: string) => `/${date.slice(0, 10).replace(/-/g, "/")}/${slug}/`;

let _posts: Post[];
export function posts(): Post[] {
  _posts ??= folders("posts")
    .map((f) => {
      const p = read(join(ROOT, "posts", f));
      return { ...p, folder: `posts/${f}`, url: postUrl(p.date, p.slug) } as Post;
    })
    .filter((p) => !p.draft)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return _posts;
}

export function pages(): Page[] {
  return folders("pages").map((f) => ({ ...read(join(ROOT, "pages", f)), folder: `pages/${f}` }) as Page);
}
export const page = (path: string) => pages().find((p) => p.path === path)!;

export function galleries(): Gallery[] {
  return folders("portfolio")
    .map((f) => ({ ...read(join(ROOT, "portfolio", f)), slug: f, url: `/portfolio/${f}/`, folder: `portfolio/${f}` }) as Gallery)
    .sort((a, b) => a.order - b.order);
}

export const CATEGORIES: Record<string, string> = {
  "adventure-journal": "News",
  "people-and-culture": "People and Culture",
  photography: "Photography",
  "travel-tips": "Travel Tips",
  video: "Video",
};
export const TAGS: Record<string, string> = {
  "adventure-travel": "adventure travel", "bike-the-world": "bike the world", coincidence: "coincidence", friends: "friends", iaeste: "iaeste", "world-trip": "world trip",
};

// Image helpers: every image lives beside its page, as <name>, <name>-m (1040 px wide) and, for galleries and featured images, <name>-sq.
export const variant = (name: string, v: "m" | "sq") => (name.endsWith(".gif") ? name : name.replace(/(\.\w+)$/, `-${v}$1`));
export const fileUrl = (base: string, name: string) => base + name;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
export const monthName = (m: number) => MONTHS[m - 1];

export function archives() {
  const seen = new Map<string, { year: string; month: string; label: string }>();
  for (const p of posts()) {
    const k = p.date.slice(0, 7);
    if (!seen.has(k)) seen.set(k, { year: k.slice(0, 4), month: k.slice(5, 7), label: `${monthName(Number(k.slice(5, 7)))} ${k.slice(0, 4)}` });
  }
  return [...seen.values()];
}

export const usedCategories = () => Object.keys(CATEGORIES).filter((c) => posts().some((p) => p.categories.includes(c)));

export function paginate<T>(items: T[], per: number) {
  const out: { items: T[]; page: number; last: number }[] = [];
  const last = Math.max(1, Math.ceil(items.length / per));
  for (let i = 0; i < last; i++) out.push({ items: items.slice(i * per, (i + 1) * per), page: i + 1, last });
  return out;
}

// Pixel size of an image in content/, for WordPress-style crops (an original smaller than the crop is not cropped).
import sharp from "sharp";
const dimsCache = new Map<string, { w: number; h: number }>();
export async function dims(folder: string, name: string) {
  const key = `${folder}/${name}`;
  if (!dimsCache.has(key)) {
    const m = await sharp(join(ROOT, folder, name)).metadata();
    dimsCache.set(key, { w: m.width!, h: m.height! });
  }
  return dimsCache.get(key)!;
}
