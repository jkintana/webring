# webring

A small webring for a group of friends' sites. Members are YAML files in
`members/`; a scheduled job checks that each site is actually carrying the
widget, and the ring routes around anyone who is down.

Static output, no server. Health checks run in GitHub Actions and are committed
as `data/status.json`, which the build reads.

The ring order reshuffles daily, sorted by a hash of (slug, UTC date) the same
way `kognise/overengineering` does it: arbitrary but deterministic, so every
rebuild within a day agrees on the order. Because this is a static build the new
order appears at the first CI run after UTC midnight rather than exactly at
midnight, so it can lag by up to the cron interval.

## Joining

1. Open a PR adding `members/<your-slug>.yaml`:

   ```yaml
   name: Your Name
   url: https://your-site.example
   ```

   The filename minus `.yaml` is your slug. See `members/EXAMPLE.yaml.txt` for
   the optional styling fields.

2. Once merged, add this to your site's footer:

   ```html
   <iframe src="https://waisi.live/embed/<your-slug>"
           title="webring"
           style="width:100%;height:56px;border:0"
           loading="lazy"></iframe>
   ```

The checker looks for that exact URL on your page. Until it finds it you show as
pending on the index and the ring skips you, so nobody lands on a dead end.

### Restyling the widget

Either set colours in your YAML, or pass query params on the iframe `src` to
override per-embed: `text_color`, `border_color`, `link_color`, `on_link_color`,
`background`, `font`, `font_size`. For example:

```
/embed/you?link_color=%23FF6400&font=Inter,sans-serif
```

Values containing `;`, `{`, `}`, `<` or `>` are ignored, so a param cannot
inject arbitrary CSS.

The bar renders about 42px tall on desktop and stacks to roughly 80px under
460px wide. The 56px above suits most sites; adjust to taste, or wrap the iframe
in a container you size yourself.

## Local development

```bash
npm install
npm run build        # writes dist/
npm run dev          # build, then serve dist/ at http://localhost:4444
npm run healthcheck  # hit every member site, rewrite data/status.json
```

`npm run healthcheck` no-ops while `config.json` still has the placeholder
`siteUrl`, since the check looks for `<siteUrl>/embed/<slug>` and nothing can
match until the domain is real.

## Health statuses

| status | in the ring? | meaning |
| --- | --- | --- |
| `ok` | yes | embedding the current domain |
| `ok_legacy_url` | yes | embedding a domain listed in `previousSiteUrls` |
| `site_unreachable` | no | fetch failed, non-2xx, or timed out |
| `no_webring_embed` | no | site loaded but no embed URL is on the page |
| `slug_mismatch` | no | an embed URL is present but for a different slug |
