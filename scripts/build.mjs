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
import { ROOT, readConfig, readMembers, readStatus, HEALTH, HEALTH_LABEL, escapeHtml } from './lib.mjs';

const config = await readConfig();
const members = await readMembers();
const status = await readStatus();
const DIST = join(ROOT, 'dist');

const healthOf = (slug) => status.results?.[slug]?.status ?? HEALTH.UNKNOWN;
const ring = members.filter((m) => healthOf(m.slug) === HEALTH.OK);

/** Neighbours within the healthy ring. Falls back to all members if the ring
 *  is too small to navigate, so a fresh install still shows working links. */
function neighbours(member) {
  const pool = ring.length >= 2 ? ring : members;
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
  const link = (m, label) => m
    ? `<a class="nav" href="${escapeHtml(m.url)}" target="_top" rel="noopener" title="${escapeHtml(m.name)}">${label}</a>`
    : `<span class="nav nav--empty">${label}</span>`;

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
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.4rem;
  }
  .ring__label { font-weight: 600; white-space: nowrap; }
  .ring__label a { color: inherit; text-decoration: none; }
  .ring__label a:hover, .ring__label a:focus-visible { text-decoration: underline; }
  .ring__nav { display: flex; align-items: center; gap: 0.75rem; }
  .nav { color: var(--link); text-decoration: none; font-weight: 600; white-space: nowrap; }
  .nav:hover, .nav:focus-visible { text-decoration: underline; }
  .nav--empty { opacity: 0.45; font-weight: 400; }
  .warn {
    margin-top: 0.4rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.85em;
    border: 1px dashed var(--border);
    border-radius: 0.3rem;
    opacity: 0.8;
  }
  @media (max-width: 460px) {
    .ring { flex-direction: column; align-items: stretch; text-align: center; }
    .ring__nav { justify-content: space-between; }
  }
</style>
</head>
<body>
<nav class="ring" aria-label="${escapeHtml(config.name)} webring">
  <span class="ring__label"><a href="${escapeHtml(config.siteUrl)}" target="_top" rel="noopener">${escapeHtml(config.name)}</a></span>
  <span class="ring__nav">
    ${link(prev, '&larr; prev')}
    <a class="nav" href="${escapeHtml(randomTarget)}" target="_top" rel="noopener">random</a>
    ${link(next, 'next &rarr;')}
  </span>
</nav>
${health === HEALTH.OK ? '' : `<p class="warn">This site is not in the ring yet: ${escapeHtml(HEALTH_LABEL[health])}. Only you see this note.</p>`}
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
  const pool = (ring.length ? ring : members).map((m) => m.url);
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

function indexPage() {
  const checked = status.checkedAt
    ? `Last checked ${escapeHtml(status.checkedAt.replace('T', ' ').replace(/\..+/, ' UTC'))}`
    : 'Not checked yet';
  const rows = members.map((m) => {
    const h = healthOf(m.slug);
    const detail = status.results?.[m.slug]?.detail;
    return `      <tr>
        <td><a href="${escapeHtml(m.url)}" rel="noopener">${escapeHtml(m.name)}</a></td>
        <td><code>${escapeHtml(m.slug)}</code></td>
        <td class="st st--${h === HEALTH.OK ? 'ok' : 'bad'}">${escapeHtml(HEALTH_LABEL[h])}${detail ? ` <span class="detail">${escapeHtml(detail)}</span>` : ''}</td>
      </tr>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)}</title>
<meta name="description" content="${escapeHtml(config.tagline)}">
<style>
  :root { color-scheme: light dark; --fg: #16181d; --bg: #fdfdfc; --muted: #5d6470; --line: #d8d8d4; --ok: #1c6b3a; --bad: #9a3412; --link: #0b57c7; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #e8e8e6; --bg: #16181a; --muted: #9aa1ac; --line: #34383d; --ok: #6fcf97; --bad: #f0a37e; --link: #7fb2ff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 68ch; padding: 3rem 1.5rem 4rem; background: var(--bg); color: var(--fg);
         font: 16px/1.6 system-ui, -apple-system, sans-serif; }
  h1 { font-size: 2rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 2.5rem 0 0.75rem; }
  p.tagline { color: var(--muted); margin: 0 0 2rem; }
  a { color: var(--link); }
  table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 600; }
  .st--ok { color: var(--ok); }
  .st--bad { color: var(--bad); }
  .detail { color: var(--muted); }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  pre { overflow-x: auto; padding: 0.9rem 1rem; border: 1px solid var(--line); border-radius: 0.4rem; background: color-mix(in srgb, var(--fg) 4%, transparent); }
  footer { margin-top: 3rem; color: var(--muted); font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>${escapeHtml(config.name)}</h1>
  <p class="tagline">${escapeHtml(config.tagline)}</p>

  <h2>Members</h2>
  <table>
    <thead><tr><th>Site</th><th>Slug</th><th>Status</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p><small>${checked}. <a href="/status.json">status.json</a></small></p>

  <h2>Joining</h2>
  <p>Open a pull request adding <code>members/&lt;your-slug&gt;.yaml</code> with your
     name and URL, then drop this into your site's footer:</p>
  <pre><code>&lt;iframe src="${escapeHtml(config.embedBase)}/&lt;your-slug&gt;"
        title="${escapeHtml(config.name)} webring"
        style="width:100%;height:56px;border:0"
        loading="lazy"&gt;&lt;/iframe&gt;</code></pre>
  <p>A checker visits every member hourly and looks for that URL on the page. Until
     it finds yours you will show as pending above, and the ring will route around you.</p>

  <footer>Built from <code>members/</code>. Health data refreshed on a schedule.</footer>
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
