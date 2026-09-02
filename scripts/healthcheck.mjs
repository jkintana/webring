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

function classify(body, member, embedBase) {
  // Which embed URLs does the page reference at all?
  const found = [...body.matchAll(new RegExp(`${escapeRe(embedBase)}/([a-z0-9-]+)`, 'g'))]
    .map((m) => m[1]);
  if (found.length === 0) return { status: HEALTH.NO_EMBED, detail: null };
  if (found.includes(member.slug)) return { status: HEALTH.OK, detail: null };
  return { status: HEALTH.SLUG_MISMATCH, detail: `found ${[...new Set(found)].join(', ')}` };
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
  return [member.slug, classify(body, member, config.embedBase)];
});

const results = Object.fromEntries(checked);
const status = { checkedAt: new Date().toISOString(), embedBase: config.embedBase, results };
await writeFile(STATUS_PATH, JSON.stringify(status, null, 2) + '\n');

for (const [slug, r] of checked) {
  const changed = previous.results?.[slug]?.status !== r.status;
  console.log(`${r.status === HEALTH.OK ? 'ok  ' : 'FAIL'} ${slug.padEnd(12)} ${r.status}${r.detail ? ` (${r.detail})` : ''}${changed ? '  [changed]' : ''}`);
}
const healthy = checked.filter(([, r]) => r.status === HEALTH.OK).length;
console.log(`\n${healthy}/${members.length} in the ring -> ${STATUS_PATH}`);
