import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDoc, type Heading, type RenderedDoc } from '../lib/docs';
import { DOCS, GROUPS, docBySlug, sourceUrl } from '../lib/docsIndex';
import { docsSlug, navigate, usePathname } from '../lib/router';

/**
 * The project's documentation, laid out for reading rather than skimming: one column of prose at a
 * comfortable measure, an index on the left, and the current page's headings on the right when the
 * window is wide enough. Nothing here talks to the live feed.
 */
export default function Docs() {
  const path = usePathname();
  const slug = useMemo(() => docsSlug() ?? DOCS[0]!.slug, [path]);
  const meta = docBySlug(slug) ?? DOCS[0]!;
  const [doc, setDoc] = useState<RenderedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const article = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setDoc(null); setError(null);
    loadDoc(slug).then((d) => { if (alive) setDoc(d); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [slug]);

  // scroll to the top on navigation, and to the anchor when the URL carries one
  useEffect(() => {
    if (!doc) return;
    const hash = window.location.hash.slice(1);
    const target = hash && article.current?.querySelector(`#${CSS.escape(hash)}`);
    if (target) (target as HTMLElement).scrollIntoView({ block: 'start' });
    else scroller.current?.scrollTo({ top: 0 });
  }, [doc]);

  // highlight the heading currently under the top of the reading area
  useEffect(() => {
    const el = article.current;
    if (!doc || !el) return;
    const targets = [...el.querySelectorAll('h2[id], h3[id]')];
    if (!targets.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root: scroller.current, rootMargin: '-8% 0px -70% 0px', threshold: 0 },
    );
    for (const t of targets) io.observe(t);
    return () => io.disconnect();
  }, [doc]);

  // internal links are handled by the router instead of reloading the page
  useEffect(() => {
    const el = article.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('/')) { e.preventDefault(); navigate(href); }
      else if (href.startsWith('#')) {
        e.preventDefault();
        el.querySelector(`#${CSS.escape(href.slice(1))}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [doc]);

  const grouped = useMemo(() => GROUPS.map((g) => ({ group: g, docs: DOCS.filter((d) => d.group === g) })), []);
  const index = DOCS.findIndex((d) => d.slug === slug);
  const prev = index > 0 ? DOCS[index - 1] : null;
  const next = index >= 0 && index < DOCS.length - 1 ? DOCS[index + 1] : null;

  return (
    <div className="docs">
      <header className="docs-top">
        <button className="docs-back" onClick={() => navigate('/')} aria-label="Back to the homepage">
          <img src="/assets/icon/overhead.svg" alt="" /><span>Overhead</span>
        </button>
        <span className="docs-crumb">Docs</span>
        <button className="docs-menu" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
          {navOpen ? 'Close' : 'All pages'}
        </button>
        <a className="docs-live" href="/live" onClick={(e) => { e.preventDefault(); navigate('/live'); }}>Open the live view</a>
      </header>

      <div className="docs-body" ref={scroller}>
        <nav className={`docs-index${navOpen ? ' open' : ''}`} aria-label="Documentation">
          {grouped.map(({ group, docs }) => (
            <div key={group} className="docs-group">
              <h4>{group}</h4>
              {docs.map((d) => (
                <button
                  key={d.slug}
                  className={`docs-link${d.slug === slug ? ' current' : ''}`}
                  aria-current={d.slug === slug ? 'page' : undefined}
                  onClick={() => { navigate(`/docs/${d.slug}`); setNavOpen(false); }}
                >
                  <span className="t">{d.title}</span>
                  <span className="b">{d.blurb}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="docs-main">
          <article className="prose" ref={article}>
            <h1>{doc?.title ?? meta.title}</h1>
            <p className="docs-lede">{meta.blurb}</p>
            {!doc && !error && <p className="muted">Loading…</p>}
            {error && <p className="muted">This page could not be loaded: {error}</p>}
            {doc && <div dangerouslySetInnerHTML={{ __html: doc.html }} />}
          </article>

          {doc && (
            <footer className="docs-foot">
              <a className="docs-source" href={sourceUrl(meta)} target="_blank" rel="noreferrer">View {meta.file} on GitHub</a>
              <div className="docs-nextprev">
                {prev && <button onClick={() => navigate(`/docs/${prev.slug}`)}>← {prev.title}</button>}
                {next && <button onClick={() => navigate(`/docs/${next.slug}`)}>{next.title} →</button>}
              </div>
            </footer>
          )}
        </main>

        <aside className="docs-toc" aria-label="On this page">
          {doc && doc.headings.length > 1 && (
            <>
              <h4>On this page</h4>
              {doc.headings.map((h: Heading) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={`lvl${h.level}${active === h.id ? ' current' : ''}`}
                  onClick={(e) => { e.preventDefault(); article.current?.querySelector(`#${CSS.escape(h.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                >
                  {h.text}
                </a>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
