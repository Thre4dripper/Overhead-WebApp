/**
 * What documentation exists — titles, blurbs and which file backs each page.
 *
 * Deliberately free of the markdown renderer: the homepage lists these, and pulling `marked` into the
 * main bundle for a list of titles would cost every visitor who never opens the docs. Rendering lives
 * in `docs.ts`, which the /docs route loads on demand.
 */
export interface DocMeta {
  slug: string;
  title: string;
  /** one line, shown in the index */
  blurb: string;
  /** which file backs it, relative to the repository root */
  file: string;
  group: 'Start here' | 'How it is built' | 'What was verified';
}

export const DOCS: DocMeta[] = [
  {
    slug: 'configuration', title: 'Configuration', group: 'Start here', file: 'docs/configuration.md',
    blurb: 'The three moving parts, what FEED means, and a recipe per deployment.',
  },
  {
    slug: 'design', title: 'Design system', group: 'Start here', file: 'docs/design.md',
    blurb: 'Tokens, typography, the layout, and how the scene is lit — adapted from FAA sectional charts.',
  },
  {
    slug: 'decisions', title: 'Decisions', group: 'How it is built', file: 'docs/decisions.md',
    blurb: 'Every judgement call with its consequence, in the order they were made.',
  },
  {
    slug: 'aircraft-data', title: 'Aircraft data sources', group: 'How it is built', file: 'docs/data-source.md',
    blurb: 'Which live feed, why, and what each one does and does not give you.',
  },
  {
    slug: 'map-data', title: 'Map and building heights', group: 'How it is built', file: 'docs/map-data.md',
    blurb: 'Vector tiles, terrain, and the fallback that renders the majority of the planet.',
  },
  {
    slug: 'design-assets', title: 'Design assets', group: 'How it is built', file: 'design/README.md',
    blurb: 'The source models and vectors, and which module consumes each one.',
  },
  {
    slug: 'research-notes', title: 'Research notes', group: 'What was verified', file: 'docs/research-notes.md',
    blurb: 'What the brief assumed, what turned out to be true, and where they differ.',
  },
  {
    slug: 'building-heights', title: 'Building height survey', group: 'What was verified', file: 'docs/evidence/building-heights-2026-09-03.md',
    blurb: 'Measured height-data coverage per city, from live tiles.',
  },
  {
    slug: 'feeds-verified', title: 'Appendix: aircraft feeds', group: 'What was verified', file: 'docs/research/aircraft-data-sources-2026-09-04.md',
    blurb: 'The full primary-source report behind the feed decision, with quotes and URLs.',
  },
  {
    slug: 'maplibre-verified', title: 'Appendix: map and MapLibre', group: 'What was verified', file: 'docs/research/map-data-maplibre-2026-09-04.md',
    blurb: 'The same for the basemap, terrain encoding and the custom-layer contract.',
  },
];

export const GROUPS = ['Start here', 'How it is built', 'What was verified'] as const;
export const docBySlug = (slug: string): DocMeta | undefined => DOCS.find((d) => d.slug === slug);

/** GitHub URL for the file behind a document, so "edit this page" and "view source" work once pushed. */
export const REPO_URL = 'https://github.com/thre4dripper/overhead';
export const sourceUrl = (doc: DocMeta): string => `${REPO_URL}/blob/main/${doc.file}`;
