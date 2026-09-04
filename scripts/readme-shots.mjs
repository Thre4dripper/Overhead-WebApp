// Regenerate the README screenshots from a running deployment, with the local Chrome (no download):
//   node scripts/readme-shots.mjs [base-url]
// Defaults to the deployed site so the images show the real thing. Software WebGL, so the 3D is
// correct but slower than a real GPU; the frames are representative, not a performance claim.
import { chromium } from 'playwright-core';
const BASE = process.argv[2] ?? 'https://overhead.ijlalahmad.dev';
const OUT = 'docs/images';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--force-color-profile=srgb'],
});
const shot = async (name, { w, h, dpr = 2, path, wait = 26000, act }) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 700, hasTouch: w < 700 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  pageerror', e.message));
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(wait);
  if (act) await act(p);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const status = await p.locator('.hud-status').textContent().catch(() => '');
  console.log(`${name}  ${w}x${h}@${dpr}  ${status.trim().slice(0, 48)}`);
  await ctx.close();
};

await shot('hero-desktop', { w: 1440, h: 820, dpr: 1.5, path: '/live?at=51.47,-0.30&theme=day&label=London' });
await shot('night-desktop', { w: 1440, h: 820, dpr: 1.5, path: '/live?at=51.47,-0.30&theme=night&label=London' });
await shot('phone-live', { w: 390, h: 844, path: '/live?at=51.47,-0.30&theme=day&label=London' });
await shot('phone-night', { w: 390, h: 844, path: '/live?at=51.47,-0.30&theme=night&label=London' });
await shot('phone-golden', { w: 390, h: 844, path: '/live?at=40.758,-73.985&theme=golden&label=New+York' });
await shot('phone-home', { w: 390, h: 844, wait: 9000, path: '/' });
await shot('phone-list', {
  w: 390, h: 844, path: '/live?at=51.47,-0.30&theme=day&label=London',
  act: async (p) => { await p.click('.sheet-handle'); await p.waitForTimeout(1200); },
});
await shot('phone-detail', {
  w: 390, h: 844, path: '/live?at=51.47,-0.30&theme=day&label=London',
  act: async (p) => {
    await p.click('.sheet-handle'); await p.waitForTimeout(1000);
    const row = await p.$('.row'); if (row) { await row.click(); await p.waitForTimeout(4000); }
  },
});
await shot('phone-ar', {
  w: 390, h: 844, path: '/live?at=51.47,-0.30&theme=day&label=London',
  act: async (p) => { await p.click('[aria-label="Point at the sky (AR view)"]'); await p.waitForTimeout(2500); },
});
await browser.close();
