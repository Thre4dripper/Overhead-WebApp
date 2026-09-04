// Screenshot the running dev server with the local Chrome (no browser download): node scripts/screenshot.mjs [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/evidence/shots';
mkdirSync(out, { recursive: true });
const base = process.env.WEB_URL ?? 'https://localhost:5173';
const SHOTS = [
  ['onboarding', '/', { clear: true }],
  ['london-day', '/live?at=51.47,-0.30&theme=day&label=London'],
  ['london-night', '/live?at=51.47,-0.30&theme=night&label=London'],
  ['newyork-golden', '/live?at=40.758,-73.985&theme=golden&label=New%20York'],
  ['denver-day-terrain', '/live?at=39.7392,-104.9903&theme=day&label=Denver'],
  ['nairobi-day-sparse', '/live?at=-1.2921,36.8219&theme=day&label=Nairobi'],
];
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, permissions: [] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
for (const [name, path, opts] of SHOTS) {
  if (opts?.clear) await page.evaluate(() => localStorage.clear()).catch(() => undefined);
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(name === 'onboarding' ? 6000 : 16000);
  const info = await page.evaluate(() => {
    const rt = window.__overhead;
    const r = document.querySelector('.hud-ruler');
    const rect = r?.getBoundingClientRect();
    return {
      webgl: !!document.createElement('canvas').getContext('webgl2'),
      labels: document.querySelectorAll('.label.on').length,
      status: document.querySelector('.hud-status')?.textContent ?? '',
      count: document.querySelector('.sheet-handle .n')?.textContent ?? '',
      ruler: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), paths: r.querySelectorAll('path').length, texts: r.querySelectorAll('text').length } : null,
      projected: rt?.projected?.length ?? null, visible: rt?.projected?.filter((p) => p.visible).length ?? null,
      mapLoaded: rt?.map?.isStyleLoaded?.() ?? null, zoom: rt?.map?.getZoom?.() ?? null, pitch: rt?.map?.getPitch?.() ?? null,
      fallback: rt?.fallbackStats ?? null,
      canvas: (() => { const c = document.querySelector('.map canvas'); return c ? { w: c.width, h: c.height } : null; })(),
    };
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
// desktop layout
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(base + '/live?at=51.47,-0.30&theme=night&label=London', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
await page.screenshot({ path: `${out}/london-night-desktop.png` });
console.log('london-night-desktop');
if (errors.length) console.log('console/page errors:\n' + [...new Set(errors)].slice(0, 25).join('\n'));
await browser.close();
