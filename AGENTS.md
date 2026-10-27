# crossingvalleys: Basile's bicycle-trip blog

crossingvalleys.com, "Basile's Travel Blog": France to China by bicycle, April 2017 to August 2018 (18,077 km, 24 countries, 492 days). Rebuilt on 2026-10-26 from the WordPress site (Ascend theme, WordPress 4.9 at OVH) as a static Astro site on a Cloudflare Worker, keeping the old layout and every old URL. This repo is **public**: never put drafts, private notes or anything not meant for the live site in it.

## Where things are

- `content/posts/<YYYY-MM-DD>-<slug>/`: one folder per post. `index.html` = YAML frontmatter + the post's HTML body; its images sit beside it and are referenced by bare filename; `comments.json` holds the comments it had on WordPress (read-only now). The post is served at `/<YYYY>/<MM>/<DD>/<slug>/`, its images at that URL too (`src/integrations/content-files.mjs` copies them at build and serves them in dev).
- `content/pages/<path with -- for />/`: Home body, Trip, Where is Basile?, Gear, Q&A, About, Instagram, Blog, Photography. `path:` in the frontmatter is the URL.
- `content/portfolio/<slug>/`: the 17 country galleries (`/portfolio/<slug>/`), `images:` in display order, `order:` = position on /photography/.
- Images: `<name>` is at most 2000 px, metadata stripped; `<name>-m` at most 1040 px wide (lists, headers, srcset); `<name>-sq` a 600x600 centre crop (gallery grids, thumbnails). Gallery photos have no `-m`.
- `src/`: Astro templates reproducing the Ascend markup; `public/theme/ascend.css` is the theme's own stylesheet (GPL, Ascend 1.2.0 from wordpress.org), `src/styles/wp-custom.css` the customizer CSS WordPress inlined, `src/styles/site.css` the rest (hero, Instagram widget, sliders, YouTube). `src/scripts/theme.js` replaces the theme's jQuery: sticky header, typed title, menus, lightbox, sliders, click-to-load YouTube.
- `src/data/instagram.json` + `public/instagram/`: a frozen copy of the Instagram widget (it no longer updates). Basile's Instagram is @basilevox (renamed from basileverhulst and basileslife); every link points there.
- The footer holds only Follow Me (Basile dropped the footer month list on 2026-10-26; the sidebar keeps it).
- `worker/index.js`: runs before the assets for every request. `/feed/` (RSS, built as `/feed.xml`), old `?p=<id>` and `?page_id=<id>` links (`worker/ids.json`), old `/wp-content/uploads/...` image URLs including WordPress size variants (`worker/uploads.json`), the attachment page WordPress gave each upload (`worker/attachments.json`, to the page it belonged to), renamed gallery slugs, per-post and comment feeds → `/feed/`, `?s=` search → DuckDuckGo. All 301. Staging adds noindex headers and a Disallow robots.txt.

## Comments

The WordPress comments (to 2023) are static, in each folder's `comments.json`. New comments are open to anyone (name and comment, optional website, no email) on every post and on Gear, Where is Basile?, Q&A and Photography, and **publish immediately** (Basile's choice, 2026-10-26). `worker/comments.js` stores them in the D1 database `crossingvalleys` (shared by staging and production, schema in `migrations/`), serves them at `GET /api/comments?page=<path>` and takes new ones at `POST /api/comments`; `src/scripts/theme.js` loads and appends them under the static ones, with replies to either kind. Spam guards: a hidden trap field, at least 3 s on the page, at most 2 links, 5 comments per visitor per 10 minutes (keyed on a salted hash of the IP; no raw IP is stored). Basile deletes comments at `/admin/` (HTTP Basic auth, user `basile`, password in 1Password `Dev/crossingvalleys-admin`, set on the Worker as the `ADMIN_PASSWORD` secret: `op read op://Dev/crossingvalleys-admin/password | op run --env-file=.env.op -- npx wrangler secret put ADMIN_PASSWORD [--env staging]`). Locally, `npx wrangler d1 migrations apply crossingvalleys --local` once and `ADMIN_PASSWORD=...` in `.dev.vars` (gitignored).

## Commands

Node 26. `npm install`, then:
- `npm run dev`: http://localhost:4321.
- `npm run build`: static site in `dist/`, then `tools/check-links.mjs` (every internal link and image must resolve).
- `npx wrangler dev`: serves `dist/` exactly as the Worker will, redirects included (restart after each build). No Cloudflare login needed.
- `npm run shots -- <base-url> <out-dir>`: full-page screenshots of the reference pages at 1440 and 390 into `shots/` (gitignored). `shots/live/` was taken from the WordPress site on 2026-10-26.
- `npm run deploy:staging`: build and deploy to https://cv.basilev.com (one Touch ID: `op run` reads the shared Infra deploy token, see `$DOTFILES/docs/basilev-com.md`).

## The import (done once, re-runnable)

`tools/import.mjs` built `content/` from the public backup of 2026-10-26 in `$COWORK_ROOT/basilev.com/backups/2026-10-26/crossingvalleys.com/` (REST JSON, rendered HTML, the 1,741 original uploads, and `supplement/`: the country pages and blog pages 2 to 5, fetched publicly the same day because the REST API does not expose them). It never touches the live WordPress. Rerunning it rewrites every `index.html` (hand edits are lost) and skips images already written. The originals stay in the backup, outside git. Basile's full-resolution exports are in `~/OneDrive/CN Trip/Photos/POSTS/` (same files as the uploads at 1920 px; a few 6000 px masters).

## Adding a post

A post is a folder in `content/posts/` named `<YYYY-MM-DD>-<slug>` with `index.html` (frontmatter: `title`, `date` (ISO), `slug`, `categories` (slugs from `CATEGORIES` in `src/lib/content.ts`), `tags`, `format`, `listing` (`landscape`, `portrait`, `slider`, `video` or `text`: how it shows in lists), `featured` (an image in the folder, needs its `-m` and `-sq` versions), optional `header` (`image`/`slider`/`video`), `excerpt` (HTML shown in lists)) and its images beside it. `draft: true` keeps it out of every page and the feed, but drafts belong in `$COWORK_ROOT/crossingvalleys/drafts/`, never here: this repo is public.

## Deployment

`wrangler.jsonc` is the whole deploy config (no adapter). Staging: Worker `crossingvalleys-staging` on the Custom Domain cv.basilev.com, unlisted (`repos.yaml`). Production has no route yet: crossingvalleys.com is still the WordPress site at OVH (registrar and DNS, ns111.ovh.net). Moving it, after Basile approves staging: he adds crossingvalleys.com to Cloudflare (free plan), switches the nameservers at OVH and adds the zone to the Infra deploy token's Zone Resources; then add `"routes": [{ "pattern": "crossingvalleys.com", "custom_domain": true }, { "pattern": "www.crossingvalleys.com", "custom_domain": true }]` to the top level of `wrangler.jsonc`, set the `ADMIN_PASSWORD` secret on the production Worker (command above, without `--env staging`), deploy with `op run --env-file=.env.op -- npx wrangler deploy`, and check the old URLs (posts, `/feed/`, `?p=`, `/wp-content/uploads/`, `/portfolio/italy/`). Email: check OVH's MX records before the switch and recreate them in Cloudflare.
