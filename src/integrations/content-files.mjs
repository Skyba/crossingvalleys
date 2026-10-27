// Serves and copies the images that sit beside each post, page and gallery in content/, so that a page at
// /2018/08/27/finally-at-destination/ finds its photos at /2018/08/27/finally-at-destination/<file>.
import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync, createReadStream } from "node:fs";
import { join, extname } from "node:path";
import YAML from "yaml";

const TYPES = { ".jpg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

function routes(root) {
  const map = new Map(); // url dir -> content dir
  for (const kind of ["posts", "pages", "portfolio"]) {
    const base = join(root, "content", kind);
    if (!existsSync(base)) continue;
    for (const f of readdirSync(base)) {
      const dir = join(base, f);
      const fm = YAML.parse(readFileSync(join(dir, "index.html"), "utf8").split("\n---")[0].replace(/^---\n/, ""));
      const url = kind === "posts" ? `/${fm.date.slice(0, 10).replace(/-/g, "/")}/${fm.slug}/` : kind === "pages" ? fm.path : `/portfolio/${f}/`;
      map.set(url, dir);
    }
  }
  return map;
}

export default function contentFiles() {
  let root;
  return {
    name: "content-files",
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        root = new URL(config.root).pathname;
        updateConfig({
          vite: {
            plugins: [{
              name: "content-files",
              configureServer(server) {
                server.middlewares.use((req, res, next) => {
                  const path = decodeURIComponent(req.url.split("?")[0]);
                  const ext = extname(path).toLowerCase();
                  if (!TYPES[ext]) return next();
                  const i = path.lastIndexOf("/") + 1;
                  const dir = routes(root).get(path.slice(0, i));
                  const file = dir && join(dir, path.slice(i));
                  if (!file || !existsSync(file)) return next();
                  res.setHeader("content-type", TYPES[ext]);
                  createReadStream(file).pipe(res);
                });
              },
            }],
          },
        });
      },
      "astro:build:done": ({ dir }) => {
        const out = new URL(dir).pathname;
        let n = 0;
        for (const [url, src] of routes(root)) {
          const dest = join(out, url);
          mkdirSync(dest, { recursive: true });
          for (const f of readdirSync(src)) if (TYPES[extname(f).toLowerCase()]) { copyFileSync(join(src, f), join(dest, f)); n++; }
        }
        console.log(`content-files: copied ${n} images`);
      },
    },
  };
}
