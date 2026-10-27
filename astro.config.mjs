import { defineConfig } from "astro/config";
import contentFiles from "./src/integrations/content-files.mjs";

export default defineConfig({
  site: "https://crossingvalleys.com",
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  session: false,
  integrations: [contentFiles()],
});
