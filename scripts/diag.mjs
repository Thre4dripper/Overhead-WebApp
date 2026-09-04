// Load one URL and poll the map state for up to 60 s: is it the style, the tiles, or the render that is slow?
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'https://localhost:5173/live?at=51.47,-0.30&theme=day';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
page.on('requestfailed', (r) => errs.push('reqfail ' + r.url().slice(0, 100) + ' ' + r.failure()?.errorText));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => {
    const rt = window.__overhead; const m = rt?.map; if (!m) return { noMap: true };
    const srcs = {}; for (const id of Object.keys(m.getStyle()?.sources ?? {})) { try { srcs[id] = m.isSourceLoaded(id); } catch { srcs[id] = 'err'; } }
    return { loaded: m.loaded(), styleLoaded: m.isStyleLoaded(), tiles: m.areTilesLoaded(), srcs, projected: rt.projected.length, status: document.querySelector('.hud-status')?.textContent, fallback: rt.fallbackStats };
  });
  console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(st));
  if (st.loaded && st.projected > 0) break;
}
if (errs.length) console.log('errors:\n' + [...new Set(errs)].slice(0, 12).join('\n'));
await page.screenshot({ path: process.argv[3] ?? '/tmp/diag.png' });
await browser.close();
