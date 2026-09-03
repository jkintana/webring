/**
 * Renders the whole static site into dist/:
 *   dist/index.html              the ring's own page, with live health
 *   dist/embed/<slug>/index.html the widget each member iframes in
 *   dist/status.json             the raw health data, for anyone curious
 *
 * Ring order is member slug order. Only healthy members are navigable, so a
 * site that is down or has dropped the widget is skipped rather than being a
 * dead end. A member's own embed page always renders, healthy or not, so they
 * can see it working while they set it up.
 */
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, readConfig, readMembers, readStatus, ringOrder, utcDayKey, HEALTH, HEALTH_LABEL, escapeHtml } from './lib.mjs';

const config = await readConfig();
const members = await readMembers();
const status = await readStatus();
const DIST = join(ROOT, 'dist');

const healthOf = (slug) => status.results?.[slug]?.status ?? HEALTH.UNKNOWN;
// A member on a previous domain is still in the ring; only truly broken ones
// are routed around.
const inRing = (s) => s === HEALTH.OK || s === HEALTH.OK_LEGACY;
const dayKey = utcDayKey();
const ordered = ringOrder(members, dayKey);
const ring = ordered.filter((m) => inRing(healthOf(m.slug)));

/** Neighbours within the healthy ring. Falls back to all members if the ring
 *  is too small to navigate, so a fresh install still shows working links. */
function neighbours(member) {
  const pool = ring.length >= 2 ? ring : ordered;
  if (pool.length === 0) return { prev: null, next: null };
  const i = pool.findIndex((m) => m.slug === member.slug);
  if (i === -1) {
    // Not in the ring: point at the ends so the widget is still useful.
    return { prev: pool[pool.length - 1], next: pool[0] };
  }
  return {
    prev: pool[(i - 1 + pool.length) % pool.length],
    next: pool[(i + 1) % pool.length],
  };
}

const cssVars = (m) => [
  ['--text', m.text_color ?? '#1a1a1a'],
  ['--border', m.border_color ?? 'currentColor'],
  ['--border-style', m.border_style ?? 'solid'],
  ['--link', m.link_color ?? '#0055cc'],
  ['--on-link', m.on_link_color ?? '#ffffff'],
  ['--bg', m.background ?? 'transparent'],
  ['--font', m.font ?? 'system-ui, sans-serif'],
  ['--font-size', m.font_size ?? '15px'],
].map(([k, v]) => `${k}: ${v};`).join(' ');

function embedPage(member) {
  const { prev, next } = neighbours(member);
  const health = healthOf(member.slug);
  const randomTarget = `${config.siteUrl}/random`;
  // Label is the neighbour's name, so the bar says who you are going to rather
  // than just which direction. Falls back to prev/next when the ring is empty.
  const link = (m, dir) => {
    const arrow = dir === 'prev' ? '&larr;' : '&rarr;';
    if (!m) return `<span class="nav nav--empty">${dir === 'prev' ? `${arrow} prev` : `next ${arrow}`}</span>`;
    // First name only. Full names ran to 404px of content, which overflows a
    // 375px phone; the full name still rides along in the title.
    const first = escapeHtml(m.name.split(/\s+/)[0]);
    const label = dir === 'prev' ? `${arrow} ${first}` : `${first} ${arrow}`;
    const title = dir === 'prev' ? `Previous site: ${m.name}` : `Next site: ${m.name}`;
    return `<a class="nav" href="${escapeHtml(m.url)}" target="_top" rel="noopener" title="${escapeHtml(title)}">${label}</a>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)} &middot; ${escapeHtml(member.name)}</title>
<meta name="robots" content="noindex">
${member.stylesheet ? `<link rel="stylesheet" href="${escapeHtml(member.stylesheet)}">` : ''}
<style>
  :root { ${cssVars(member)} }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: var(--font-size);
    line-height: 1.4;
  }
  .ring {
    /* 1fr auto 1fr keeps the middle group optically centred even when "prev"
       and "next" are different widths, which space-between would not do. */
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border: 1px var(--border-style) var(--border);
    border-radius: 0.4rem;
  }
  .ring__start { justify-self: start; }
  .ring__mid { justify-self: center; display: flex; align-items: center; gap: 0.4rem; }
  .ring__end { justify-self: end; }
  .nav { color: var(--link); text-decoration: none; font-weight: 600; white-space: nowrap; }
  .nav:hover, .nav:focus-visible { text-decoration: underline; }
  .nav--empty { opacity: 0.45; font-weight: 400; }
  .ring__name { font-weight: 600; white-space: nowrap; }
  .ring__sep { opacity: 0.4; }
  .warn {
    margin-top: 0.4rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.85em;
    border: 1px dashed var(--border);
    border-radius: 0.3rem;
    opacity: 0.8;
  }
  @media (max-width: 400px) {
    .ring { gap: 0.4rem; padding: 0.6rem 0.5rem; }
    .ring__mid { gap: 0.3rem; }
  }
</style>
</head>
<body>
<nav class="ring" aria-label="${escapeHtml(config.name)} webring">
  <span class="ring__start">${link(prev, 'prev')}</span>
  <span class="ring__mid">
    <a class="nav" href="${escapeHtml(randomTarget)}" target="_top" rel="noopener">rand</a>
    <span class="ring__sep" aria-hidden="true">&middot;</span>
    <span class="ring__name">${escapeHtml(config.name)}</span>
    <span class="ring__sep" aria-hidden="true">&middot;</span>
    <a class="nav" href="${escapeHtml(config.siteUrl)}" target="_top" rel="noopener">list</a>
  </span>
  <span class="ring__end">${link(next, 'next')}</span>
</nav>
${inRing(health) ? '' : `<p class="warn">This site is not in the ring yet: ${escapeHtml(HEALTH_LABEL[health])}. Only you see this note.</p>`}
<script>
  // Colours and type can be overridden per-embed with query params, which is
  // how a member restyles the widget without editing their config.
  (function () {
    var allowed = {
      text_color: '--text', border_color: '--border', link_color: '--link',
      on_link_color: '--on-link', background: '--bg', font: '--font', font_size: '--font-size'
    };
    var params = new URLSearchParams(location.search);
    Object.keys(allowed).forEach(function (key) {
      var value = params.get(key);
      // Reject anything that could close the declaration and inject CSS.
      if (value && !/[;{}<>]/.test(value)) {
        document.documentElement.style.setProperty(allowed[key], value);
      }
    });
  })();
</script>
</body>
</html>
`;
}

function randomPage() {
  const pool = (ring.length ? ring : ordered).map((m) => m.url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(config.name)} &middot; random</title>
<meta name="robots" content="noindex">
<script>
  var sites = ${JSON.stringify(pool)};
  location.replace(sites.length ? sites[Math.floor(Math.random() * sites.length)] : ${JSON.stringify(config.siteUrl)});
</script>
</head>
<body><p>Sending you somewhere at random&hellip;</p></body>
</html>
`;
}

/** Tagline with one phrase optionally turned into a link. The tagline is
 *  escaped first, so this never allows arbitrary HTML in from config. */
/** Turns the phrases in config.taglineLinks into links. Escapes first, so this
 *  never allows arbitrary HTML in from config. */
function linkify(text) {
  let html = escapeHtml(text ?? '');
  for (const l of config.taglineLinks ?? []) {
    if (!l?.text || !l?.url) continue;
    const needle = escapeHtml(l.text);
    if (!html.includes(needle)) continue;
    html = html.replace(needle, `<a href="${escapeHtml(l.url)}" rel="noopener">${needle}</a>`);
  }
  return html;
}

const displayUrl = (url) => url.replace(/^https?:\/\//, '');

/** A table row. The status column only appears in the inactive table. */
function memberRow(m, withStatus) {
  const h = healthOf(m.slug);
  const detail = status.results?.[m.slug]?.detail;
  const statusCell = withStatus
    ? `\n        <td class="st">${escapeHtml(HEALTH_LABEL[h])}${detail ? ` <span class="detail">${escapeHtml(detail)}</span>` : ''}</td>`
    : '';
  return `      <tr>
        <td><a href="${escapeHtml(m.url)}" rel="noopener">${escapeHtml(m.name)}</a></td>
        <td class="site">${escapeHtml(displayUrl(m.url))}</td>${statusCell}
      </tr>`;
}

function indexPage() {
  const checked = status.checkedAt
    ? `Last checked ${escapeHtml(status.checkedAt.replace('T', ' ').replace(/\..+/, ' UTC'))}`
    : 'Not checked yet';
  const active = ordered.filter((m) => inRing(healthOf(m.slug)));
  const inactive = ordered.filter((m) => !inRing(healthOf(m.slug)));

  const table = (rows, withStatus) => `  <table>
    <thead><tr><th>Member</th><th>Site</th>${withStatus ? '<th>Status</th>' : ''}</tr></thead>
    <tbody>
${rows.map((m) => memberRow(m, withStatus)).join('\n')}
    </tbody>
  </table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)}</title>
<meta name="description" content="${escapeHtml([config.tagline, config.credit].filter(Boolean).join(' '))}">
<style>
  :root { color-scheme: light dark; --fg: #16181d; --bg: #fdfdfc; --muted: #5d6470; --line: #d8d8d4; --link: #0b57c7; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e8e8e6; --bg: #16181a; --muted: #9aa1ac; --line: #34383d; --link: #7fb2ff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 68ch; padding: 3rem 1.5rem 4rem; background: var(--bg); color: var(--fg);
         font: 16px/1.6 system-ui, -apple-system, sans-serif; }
  h1 { font-size: 2rem; margin: 0 0 0.75rem; }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 0.75rem; }
  p.tagline { margin: 0 0 2rem; }
  p.invite { color: var(--muted); margin: 0 0 2rem; }
  a { color: var(--link); }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 600; }
  .site, .st, .detail { color: var(--muted); }
  p.meta { color: var(--muted); font-size: 0.9rem; margin-top: 0.9rem; }
</style>
</head>
<body>
  <h1>${escapeHtml(config.name)}</h1>
  <p class="tagline">${linkify(config.tagline)}${config.credit ? `<br>${linkify(config.credit)}` : ''}</p>

  <h2>Active</h2>
${active.length ? table(active, false) : '  <p class="invite">Nobody has the widget installed yet.</p>'}
  <p class="meta">Ring order is shuffled daily. ${checked} (<a href="/status.json">status.json</a>).</p>
${inactive.length ? `
  <h2>Inactive</h2>
${table(inactive, true)}` : ''}
</body>
</html>
`;
}

await mkdir(DIST, { recursive: true });
await writeFile(join(DIST, 'index.html'), indexPage());
await mkdir(join(DIST, 'random'), { recursive: true });
await writeFile(join(DIST, 'random', 'index.html'), randomPage());
for (const member of members) {
  const dir = join(DIST, 'embed', member.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), embedPage(member));
}
if (existsSync(join(ROOT, 'data', 'status.json'))) {
  await copyFile(join(ROOT, 'data', 'status.json'), join(DIST, 'status.json'));
}
// GitHub Pages would otherwise run everything through Jekyll.
await writeFile(join(DIST, '.nojekyll'), '');
// Pages reads the custom domain from this file on every deploy; without it the
// domain set in the UI gets cleared each time the workflow publishes.
await writeFile(join(DIST, 'CNAME'), `${config.siteUrl.replace(/^https?:\/\//, '')}\n`);

console.log(`built ${members.length} embed page(s); ${ring.length} in the ring`);
if (config.siteUrl.includes('REPLACE-ME')) {
  console.warn('\nNOTE: config.json siteUrl is still the placeholder, so the embed');
  console.warn('snippet and health checks point nowhere real yet.');
}
