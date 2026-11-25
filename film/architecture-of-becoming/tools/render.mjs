#!/usr/bin/env node
/*
 * Offline renderer for "NYXA – The Architecture of Becoming".
 *   node tools/render.mjs stills  <out.png> <t1,t2,...> [w h]        -> contact sheet of given times
 *   node tools/render.mjs frames  <outDir> <w> <h> <fps> [segmentsJSON] [subs]
 *        segmentsJSON: [[filmStart, filmEnd], ...]  (default: whole film). Frames are numbered continuously.
 * Uses the preinstalled Playwright Chromium, deterministic renderFrame(t), 4 parallel pages.
 */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2", ".json": "application/json", ".wav": "audio/wav" };

function serve() {
  return new Promise((ok) => {
    const srv = createServer(async (req, res) => {
      try {
        const p = resolve(ROOT, "." + decodeURIComponent(new URL(req.url, "http://x").pathname));
        if (!p.startsWith(ROOT)) throw new Error("outside");
        const b = await readFile(p);
        res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(b);
      } catch { res.writeHead(404); res.end(); }
    }).listen(0, "127.0.0.1", () => ok(srv));
  });
}

async function openPage(browser, port, w, h, subs) {
  const page = await browser.newPage({ viewport: { width: Math.min(w, 1920), height: Math.min(h, 1920) } });
  page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?render=1&w=${w}&h=${h}${subs ? "&subs=" + subs : ""}`);
  await page.evaluate(() => window.fontsReady);
  return page;
}
const grab = (page, t, q = 0.93) => page.evaluate(([t, q]) => { window.renderAt(t); return document.getElementById("film").toDataURL("image/jpeg", q).split(",")[1]; }, [t, q]);

async function main() {
  const [mode, out, a3, a4, a5, a6, a7, a8] = process.argv.slice(2);
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch({ args: ["--disable-gpu-vsync", "--disable-frame-rate-limit"] });
  try {
    if (mode === "stills") {
      const times = a3.split(",").map(Number); const w = +a4 || 960, h = +a5 || 540;
      const page = await openPage(browser, port, w, h, a6);
      await mkdir(dirname(resolve(out)), { recursive: true });
      const imgs = [];
      for (const t of times) imgs.push(await grab(page, t, 0.9));
      // build a contact sheet in-page
      const cols = Math.min(4, times.length);
      const sheet = await page.evaluate(async ([imgs, times, w, h, cols]) => {
        const rows = Math.ceil(imgs.length / cols); const c = document.createElement("canvas");
        c.width = cols * w; c.height = rows * (h + 24); const g = c.getContext("2d"); g.fillStyle = "#111"; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < imgs.length; i++) {
          const im = new Image(); im.src = "data:image/jpeg;base64," + imgs[i]; await im.decode();
          const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 24); g.drawImage(im, x, y + 24, w, h);
          g.fillStyle = "#ddd"; g.font = "14px monospace"; g.fillText("t=" + times[i].toFixed(1) + "s", x + 6, y + 17);
        }
        return c.toDataURL("image/png").split(",")[1];
      }, [imgs, times, w, h, cols]);
      await writeFile(out, Buffer.from(sheet, "base64"));
      console.log("wrote", out);
    } else if (mode === "frames") {
      const w = +a3, h = +a4, fps = +a5; const subs = a7 || null;
      const dur = await (await openPage(browser, port, 64, 64)).evaluate(() => window.FILM.duration);
      const segs = a6 && a6 !== "-" ? JSON.parse(a6) : [[0, dur]];
      const ts = []; segs.forEach(([s, e]) => { for (let f = 0; f < Math.round((e - s) * fps); f++) ts.push(s + f / fps); });
      await mkdir(out, { recursive: true });
      const N = +(a8 || 4); const pages = await Promise.all(Array.from({ length: N }, () => openPage(browser, port, w, h, subs)));
      let next = 0, done = 0; const t0 = Date.now();
      await Promise.all(pages.map(async (page) => {
        while (true) {
          const i = next++; if (i >= ts.length) break;
          const b = await grab(page, ts[i]);
          await writeFile(join(out, String(i).padStart(6, "0") + ".jpg"), Buffer.from(b, "base64"));
          if (++done % 300 === 0) console.log(`${done}/${ts.length} frames, ${((Date.now() - t0) / done).toFixed(0)} ms/frame`);
        }
      }));
      console.log("frames done", ts.length, "in", ((Date.now() - t0) / 1000).toFixed(0), "s");
    } else throw new Error("unknown mode " + mode);
  } finally { await browser.close(); srv.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
