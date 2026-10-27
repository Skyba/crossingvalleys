// RSS 2.0 of every post, served at /feed/ (the WordPress feed URL) by worker/index.js.
import rss from "@astrojs/rss";
import { posts, CATEGORIES } from "../lib/content";

export function GET(context: { site: URL }) {
  return rss({
    title: "Basile's Travel Blog",
    description: "People, culture & travel hazards",
    site: context.site,
    items: posts().map((p) => ({
      title: p.title,
      link: p.url,
      pubDate: new Date(p.date + "Z"),
      categories: p.categories.map((c) => CATEGORIES[c]),
      description: p.excerpt.replace(/<a class="kt-excerpt-readmore[^]*?<\/a>/, "").replace(/<[^>]+>/g, "").trim(),
      content: p.body.replace(/ srcset="[^"]*"/g, "").replace(/(src|href)="(?!https?:|\/\/|#|mailto:)([^"]+)"/g, (_, a, v) => `${a}="${new URL(v.startsWith("/") ? v : p.url + v, context.site).href}"`),
    })),
  });
}
