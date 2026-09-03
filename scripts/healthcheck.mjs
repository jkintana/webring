/**
 * Fetches every member site and works out whether it is actually carrying the
 * widget. Writes data/status.json, which the build reads to decide who is in
 * the ring. Runs on a cron in CI; safe to run locally too.
 */
import { writeFile } from 'node:fs/promises';
import { readConfig, readMembers, readStatus, STATUS_PATH, HEALTH } from './lib.mjs';

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'webring-healthcheck (+https://github.com/)' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { body: await res.text() };
  } catch (err) {
    return { error: err.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

function classify(rawBody, member, embedBases) {
  // A commented-out embed is not installed, however much it looks like it in
  // the source. Strip comments before matching so it reads as absent.
  const body = rawBody.replace(/<!--[\s\S]*?-->/g, '');
  // Try the current domain first, then any the ring used to live at, so a
  // domain move does not knock everyone out of the ring at once.
  let sawSomeEmbed = null;
  for (const [i, base] of embedBases.entries()) {
    const found = [...body.matchAll(new RegExp(`${escapeRe(base)}/([a-z0-9-]+)`, 'g'))]
      .map((m) => m[1]);
    if (found.length === 0) continue;
    if (found.includes(member.slug)) {
      return i === 0
        ? { status: HEALTH.OK, detail: null }
        : { status: HEALTH.OK_LEGACY, detail: `still embedding ${base}` };
    }
    // Right domain, wrong slug. Remember it but keep looking at older bases.
    sawSomeEmbed ??= { status: HEALTH.SLUG_MISMATCH, detail: `found ${[...new Set(found)].join(', ')}` };
  }
  return sawSomeEmbed ?? { status: HEALTH.NO_EMBED, detail: null };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

const config = await readConfig();
const members = await readMembers();
const previous = await readStatus();

if (config.siteUrl.includes('REPLACE-ME')) {
  console.warn('config.json still has the placeholder siteUrl. Health checks look');
  console.warn('for <siteUrl>/embed/<slug> on each page, so nothing can pass yet.');
  console.warn('Skipping the checks and leaving status.json alone.');
  process.exit(0);
}

const checked = await mapLimit(members, config.healthcheck.concurrency, async (member) => {
  const { body, error } = await fetchText(member.url, config.healthcheck.timeoutMs);
  if (error) return [member.slug, { status: HEALTH.UNREACHABLE, detail: error }];
  return [member.slug, classify(body, member, config.embedBases)];
});

const results = Object.fromEntries(checked);
const status = {
  checkedAt: new Date().toISOString(),
  embedBase: config.embedBase,
  acceptedBases: config.embedBases,
  results,
};
await writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');

const inRing = (s) => s === HEALTH.OK || s === HEALTH.OK_LEGACY;
for (const [slug, r] of checked) {
  const changed = previous.results?.[slug]?.status !== r.status;
  const tag = r.status === HEALTH.OK ? 'ok  ' : inRing(r.status) ? 'old ' : 'FAIL';
  console.log(`${tag} ${slug.padEnd(12)} ${r.status}${r.detail ? ` (${r.detail})` : ''}${changed ? '  [changed]' : ''}`);
}
const healthy = checked.filter(([, r]) => inRing(r.status)).length;
console.log(`\n${healthy}/${members.length} in the ring -> ${STATUS_PATH}`);
