// Rasterise the app icon SVGs for the PWA manifest (192, 512, maskable 512) and a mono badge.
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'apps/web/public/icons';
mkdirSync(out, { recursive: true });
const icon = readFileSync('apps/web/public/assets/icon/overhead.svg', 'utf8');
const mono = readFileSync('apps/web/public/assets/icon/overhead-mono.svg', 'utf8').replace('fill="currentColor" color="#1d2e44"', 'fill="#ffffff"').replace(/fill="currentColor"/g, 'fill="#ffffff"');
const render = (svg, size, file) => {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`${out}/${file}`, png);
  console.log(file, png.length, 'bytes');
};
render(icon, 192, 'icon-192.png');
render(icon, 512, 'icon-512.png');
// maskable: the icon is already full-bleed with its identifying content inside the r=410 safe circle
render(icon, 512, 'icon-maskable-512.png');
render(mono, 96, 'badge-96.png');
