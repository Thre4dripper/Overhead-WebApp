// Centre the camera on the most-overhead live aircraft and report what the three.js layer drew.
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'https://localhost:5173/live?at=33.95,-118.30&theme=day';
const out = process.argv[3] ?? 'docs/evidence/shots/aircraft-closeup.png';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(14000);
const r = await page.evaluate(async () => {
  const rt = window.__overhead; const m = rt.map;
  const list = rt.projected.slice().sort((a, b) => a.tracked.altM - b.tracked.altM);
  if (!list.length) return { none: true };
  const t = list[Math.floor(list.length / 2)].tracked; // a mid-altitude one
  m.jumpTo({ center: [t.lon, t.lat], zoom: 14.2, pitch: 55, bearing: (t.track + 180) % 360, padding: { top: 0, bottom: 260, left: 0, right: 0 } });
  await new Promise((res) => setTimeout(res, 3500));
  const pr = rt.projected.find((p) => p.icao24 === t.icao24);
  return { icao: t.icao24, callsign: t.a.callsign, category: t.a.category, altM: Math.round(t.altM), visualM: pr && Math.round(pr.visualM), screen: pr && { x: Math.round(pr.x), y: Math.round(pr.y), lengthPx: Math.round(pr.lengthPx), pxPerM: +pr.pxPerM.toFixed(3) }, visible: rt.projected.filter((p) => p.visible).length, labels: document.querySelectorAll('.label.on').length, layer: rt.layer?.stats };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: out });
await browser.close();
