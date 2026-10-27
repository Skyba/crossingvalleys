// Full-page screenshot through Chrome's DevTools protocol, no dependencies.
// node tools/shot.mjs <url> <out.png> [width=1440] [viewportHeight=900]   (REDUCED=1 for the reduced-motion render)
// The viewport stays a normal height (so 100vh heroes look right); the capture
// extends beyond it to the whole page.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out, w = "1440", h = "900"] = process.argv.slice(2);
const CHROME = `${process.env.HOME}/.local/bin/chrome-headless-shell`;
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "shot-"))}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => chrome.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const waiters = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d); pending.delete(d.id); } else if (d.method) waiters.filter((x) => x.method === d.method).forEach((x) => x.resolve(d)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
await send("Page.enable");
const mobile = Number(w) < 600;
await send("Emulation.setDeviceMetricsOverride", { width: Number(w), height: Number(h), deviceScaleFactor: mobile ? 2 : 1, mobile });
// REDUCED=1 renders the page as a reduced-motion visitor sees it: the finished state, no half-typed text.
if (process.env.REDUCED === "1") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url });
await loaded; await sleep(Number(process.env.WAIT || 1800));
// Lazy images below the viewport never load in a full-page capture: force them and wait for decode.
await send("Runtime.evaluate", { expression: "(async()=>{const imgs=[...document.images].filter(i=>i.getAttribute('src'));imgs.forEach(i=>{i.loading='eager';});await new Promise(r=>setTimeout(r,50));await Promise.all(imgs.map(i=>i.decode().catch(()=>null)));})()", awaitPromise: true });
await sleep(300);
// Scroll through once so scroll-triggered sections reveal, then back to top.
await send("Runtime.evaluate", { expression: "(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=400){scrollTo(0,y);await new Promise(r=>setTimeout(r,60))}scrollTo(0,0)})()", awaitPromise: true });
await sleep(600);
// SCROLL=<y> captures just the viewport after scrolling to y: for effects that
// only exist in the viewport (a beam scrubbed by scroll), which a full-page
// capture cannot show.
if (process.env.SCROLL) {
  await send("Runtime.evaluate", { expression: `scrollTo(0, ${Number(process.env.SCROLL)})` });
  await sleep(900);
  // EVAL=<js> runs in the page before the capture, e.g. to click a button
  if (process.env.EVAL) { await send("Runtime.evaluate", { expression: process.env.EVAL }); await sleep(600); }
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(`${out}: viewport at scroll ${process.env.SCROLL}`);
  ws.close(); chrome.kill(); process.exit(0);
}
const { cssContentSize } = await send("Page.getLayoutMetrics");
const height = Math.min(Math.ceil(cssContentSize.height), 16000);
// captureBeyondViewport drops large JPEGs from the raster; enlarge the viewport to the page instead.
await send("Emulation.setDeviceMetricsOverride", { width: Number(w), height, deviceScaleFactor: mobile ? 2 : 1, mobile });
await sleep(700);
await send("Runtime.evaluate", { expression: "scrollTo(0,0)" });
const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: Number(w), height, scale: 1 } });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out}: ${w}x${height}`);
ws.close(); chrome.kill();
