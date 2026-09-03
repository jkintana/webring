import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STATUS_PATH = join(ROOT, 'data', 'status.json');

export async function readConfig() {
  const cfg = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  // One trailing slash, never two: every embed URL is built off this.
  cfg.siteUrl = cfg.siteUrl.replace(/\/+$/, '');
  cfg.embedBase = `${cfg.siteUrl}/embed`;
  // Every base the health check will accept. Current one first, so it wins when
  // a page happens to reference more than one.
  cfg.previousSiteUrls = (cfg.previousSiteUrls ?? []).map((u) => u.replace(/\/+$/, ''));
  cfg.embedBases = [cfg.embedBase, ...cfg.previousSiteUrls.map((u) => `${u}/embed`)];
  return cfg;
}

/** Members, sorted by slug so the ring order is deterministic across builds. */
export async function readMembers() {
  const dir = join(ROOT, 'members');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml'));
  const members = [];
  for (const file of files) {
    const slug = file.replace(/\.yaml$/, '');
    const raw = parseYaml(await readFile(join(dir, file), 'utf8'));
    if (!raw?.name || !raw?.url) {
      throw new Error(`members/${file}: both "name" and "url" are required`);
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error(`members/${file}: slug must be lowercase letters, digits and dashes`);
    }
    const where = `members/${file}`;
    members.push({
      slug,
      name: String(raw.name),
      url: safeUrl(raw.url, `${where} url`),
      text_color: cssValue(raw.text_color, `${where} text_color`),
      border_color: cssValue(raw.border_color, `${where} border_color`),
      border_style: cssValue(raw.border_style, `${where} border_style`),
      link_color: cssValue(raw.link_color, `${where} link_color`),
      on_link_color: cssValue(raw.on_link_color, `${where} on_link_color`),
      background: cssValue(raw.background, `${where} background`),
      font: cssValue(raw.font, `${where} font`),
      font_size: cssValue(raw.font_size, `${where} font_size`),
      stylesheet: raw.stylesheet == null ? null : safeUrl(raw.stylesheet, `${where} stylesheet`),
    });
  }
  members.sort((a, b) => a.slug.localeCompare(b.slug));
  return members;
}

export async function readStatus() {
  if (!existsSync(STATUS_PATH)) return { checkedAt: null, results: {} };
  try {
    return JSON.parse(await readFile(STATUS_PATH, 'utf8'));
  } catch {
    return { checkedAt: null, results: {} };
  }
}

export const HEALTH = {
  OK: 'ok',
  OK_LEGACY: 'ok_legacy_url',
  UNREACHABLE: 'site_unreachable',
  NO_EMBED: 'no_webring_embed',
  SLUG_MISMATCH: 'slug_mismatch',
  UNKNOWN: 'unknown',
};

export const HEALTH_LABEL = {
  [HEALTH.OK]: 'in the ring',
  [HEALTH.OK_LEGACY]: 'in the ring, on an old URL',
  [HEALTH.UNREACHABLE]: 'site unreachable',
  [HEALTH.NO_EMBED]: 'not found on page',
  [HEALTH.SLUG_MISMATCH]: 'widget points at the wrong slug',
  [HEALTH.UNKNOWN]: 'not checked yet',
};

/** The UTC calendar day, as YYYY-MM-DD. The seed for the daily shuffle. */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Ring order for a given day. Same trick as kognise/overengineering: sort by a
 * hash of (slug, date), which is arbitrary but completely deterministic, so
 * every rebuild within the same UTC day produces an identical ring and the
 * order reshuffles at midnight. Members keep their slug-sorted order elsewhere
 * so diffs and health output stay readable.
 */
export function ringOrder(members, dayKey = utcDayKey()) {
  const rank = new Map(
    members.map((m) => [m.slug, createHash('sha256').update(`${m.slug}:${dayKey}`).digest('hex')])
  );
  return [...members].sort((a, b) => rank.get(a.slug).localeCompare(rank.get(b.slug)));
}

/**
 * A value safe to drop into an inline `style` block. Anything that could close
 * the declaration or open a tag is rejected, matching the guard on the runtime
 * query-param overrides. Returns null for a bad value so the caller falls back
 * to its default rather than emitting broken or hostile CSS.
 */
function cssValue(raw, where) {
  if (raw == null) return null;
  const v = String(raw);
  if (/[;{}<>()\\]|\/\*|url\s*\(|@import|expression/i.test(v)) {
    console.warn(`${where}: refusing CSS value ${JSON.stringify(v)}; using the default instead.`);
    return null;
  }
  return v;
}

/** Only http(s) links get rendered. javascript:, data: and friends become live
 *  hrefs in the top frame otherwise, since the widget uses target="_top". */
function safeUrl(raw, where) {
  const v = String(raw).trim();
  let parsed;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error(`${where}: "${v}" is not a valid absolute URL (include https://)`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${where}: "${v}" must be http or https, got ${parsed.protocol}`);
  }
  return v.replace(/\/+$/, '');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
