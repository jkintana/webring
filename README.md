# webring

A small webring for a group of friends' sites. Members are YAML files in
`members/`; a scheduled job checks that each site is actually carrying the
widget, and the ring routes around anyone who is down.

Static output, no server. Health checks run in GitHub Actions and are committed
as `data/status.json`, which the build reads.

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
   <iframe src="https://ring.waisi.now/embed/<your-slug>"
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

## Setup checklist

- [x] Name and domain: `WAISI & co` at `ring.waisi.now`
- [ ] Push to GitHub as a **public** repo (Actions minutes are free and
      unlimited there; a private repo would burn its 2,000 monthly minutes)
- [ ] Settings → Pages → Source: **GitHub Actions**
- [ ] At Porkbun, add a DNS record: type `CNAME`, host `ring`,
      answer `<your-github-username>.github.io`
- [ ] Settings → Pages → Custom domain: `ring.waisi.now`, then wait for the
      DNS check to pass and tick **Enforce HTTPS**
- [ ] Push once and confirm the workflow deploys
- [ ] Add the iframe to your own site first, so there is one healthy member
- [ ] Send everyone else their snippet

`dist/CNAME` is generated from `siteUrl`, so the custom domain survives every
deploy. Without it Pages clears the domain each time the workflow publishes.

## Health statuses

| status | in the ring? | meaning |
| --- | --- | --- |
| `ok` | yes | embedding the current domain |
| `ok_legacy_url` | yes | embedding a domain listed in `previousSiteUrls` |
| `site_unreachable` | no | fetch failed, non-2xx, or timed out |
| `no_webring_embed` | no | site loaded but no embed URL is on the page |
| `slug_mismatch` | no | an embed URL is present but for a different slug |

## Changing the domain later

Two separate things break, and only one is automatic.

**Health checks: handled.** Add the old domain to `previousSiteUrls` in
`config.json` and members still on it stay in the ring, reported as
`ok_legacy_url` so you can see who has not moved yet. Without that entry every
member flips to `no_webring_embed` the moment you change `siteUrl`.

```json
"siteUrl": "https://ring.newname.dev",
"previousSiteUrls": ["https://ring.waisi.now"]
```

**The widget itself: needs the old domain to keep resolving.** Members' iframes
point at the old URL, so if it stops answering they render blank no matter what
this repo says. Keep the old domain registered and forward it, path intact, to
the new one. Porkbun's URL forwarding does this for free, as do Cloudflare
redirect rules.

Note that GitHub Pages allows **one** custom domain per repository, so you
cannot simply serve both domains from this site. The old one has to redirect.

Only if you let the old domain lapse does everyone have to edit their site.

## Two Actions caveats worth knowing

**Scheduled runs are best-effort.** GitHub says the `schedule` event "can be
delayed during periods of high loads" and that "some queued jobs may be
dropped", with the top of the hour being the worst. The cron is set to `:37` for
that reason. A missed run just means health data is an hour stale.

**Scheduled workflows are disabled after 60 days of no repository activity** on
public repos. If this ring sits completely untouched for two months the checks
stop until someone re-enables the workflow in the Actions tab. Adding a member
or any other commit resets the clock.
