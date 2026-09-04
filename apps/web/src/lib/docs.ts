import { marked } from 'marked';
import { DOCS, docBySlug } from './docsIndex';

/**
 * Renders one documentation page. The markdown files stay where they belong — `docs/` and `design/` at
 * the repository root — and are pulled in as raw text by Vite. The glob is lazy, so each document is
 * its own chunk and only the page being read is downloaded.
 */
const RAW = import.meta.glob<string>(['../../../../docs/*.md', '../../../../docs/research/*.md', '../../../../design/README.md'], {
  query: '?raw',
  import: 'default',
});

function loaderFor(file: string): (() => Promise<string>) | undefined {
  const suffix = `/${file}`;
  const key = Object.keys(RAW).find((k) => k.endsWith(suffix));
  return key ? (RAW[key] as () => Promise<string>) : undefined;
}

export interface Heading { id: string; text: string; level: 2 | 3 }
export interface RenderedDoc { title: string; html: string; headings: Heading[] }

const slugify = (text: string): string =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);

/**
 * Render one document to HTML plus a table of contents.
 *
 * The first `#` heading becomes the page title and is dropped from the body, so the layout supplies it
 * once. Headings get stable ids for in-page links, and tables are wrapped so a wide one scrolls inside
 * its own box rather than stretching the page. The markdown is this repository's own, not user input.
 */
export async function loadDoc(slug: string): Promise<RenderedDoc> {
  const doc = docBySlug(slug);
  if (!doc) throw new Error(`unknown document: ${slug}`);
  const load = loaderFor(doc.file);
  if (!load) throw new Error(`document not bundled: ${doc.file}`);
  let md = await load();

  let title = doc.title;
  md = md.replace(/^#\s+(.+)\n+/, (_m, h1: string) => { title = h1.trim(); return ''; });

  const headings: Heading[] = [];
  const used = new Set<string>();
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = this_text(tokens);
    let id = slugify(text) || `section-${headings.length + 1}`;
    while (used.has(id)) id = `${id}-x`;
    used.add(id);
    if (depth === 2 || depth === 3) headings.push({ id, text, level: depth });
    return `<h${depth} id="${id}">${marked.parseInline(text) as string}</h${depth}>\n`;
  };
  renderer.table = (token) => {
    const html = new marked.Renderer().table.call(renderer, token) as string;
    return `<div class="doc-table">${html}</div>`;
  };
  renderer.link = ({ href, title: t, tokens }) => {
    const text = marked.parseInline(this_text(tokens)) as string;
    const external = /^https?:/.test(href);
    // links between documents keep the reader in the app
    const internal = DOCS.find((d) => href.endsWith(d.file.replace(/^docs\//, '')) || href === d.file);
    const target = internal ? `/docs/${internal.slug}` : href;
    const attrs = external ? ' target="_blank" rel="noreferrer"' : '';
    return `<a href="${target}"${t ? ` title="${t}"` : ''}${attrs}>${text}</a>`;
  };

  const html = marked.parse(md, { gfm: true, breaks: false, renderer, async: false }) as string;
  return { title, html, headings };
}

/** marked hands tokens rather than text to custom renderers; this recovers the plain text. */
function this_text(tokens: { raw?: string; text?: string }[] | undefined): string {
  if (!tokens) return '';
  return tokens.map((t) => t.text ?? t.raw ?? '').join('');
}
