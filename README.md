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

You need two things: an entry in this repo, and one line of HTML on your site.
Either can happen first, but the widget will not appear in the ring until both
are done.

### 1. Get a member entry

Open a pull request adding `members/<your-slug>.yaml`:

```yaml
name: Your Name
url: https://your-site.example
```

The filename minus `.yaml` is your **slug**: lowercase letters, digits and
dashes only. `name` and `url` are the only required fields. Everything else is
styling, covered below and in `members/EXAMPLE.yaml.txt`.

(Or just ask whoever runs the ring to add you, and skip the PR.)

### 2. Put the widget on your site

Paste this wherever you want it, usually the footer, replacing `YOUR-SLUG`:

```html
<iframe src="https://waisi.live/embed/YOUR-SLUG"
        title="waisi.live webring"
        style="width:100%;height:44px;border:0"
        loading="lazy"></iframe>
```

**Do not change the URL.** An automated check fetches your page and looks for
that exact string. Rewriting it, proxying it, or building it from JavaScript at
runtime will all read as "not installed".

### What happens next

A job runs hourly and fetches every member site. You get one of:

| status | in the ring? | meaning |
| --- | --- | --- |
| `ok` | yes | found your embed, you are in |
| `site_unreachable` | no | fetch failed, non-2xx, or timed out |
| `no_webring_embed` | no | page loaded, embed URL not on it |
| `slug_mismatch` | no | an embed URL is there, but for someone else's slug |

Until the check finds you, the index lists you under **Inactive** and the ring
routes around you, so nobody clicking `prev`/`next` lands on a dead end. Expect
up to an hour before you flip to Active. That is normal, not a failure.

## Styling the widget

**Your site's CSS cannot reach inside the widget.** It is a cross-origin
iframe, so no selector you write will style the bar. There are three levers
instead:

**1. Your member YAML** — applies everywhere your embed appears:

```yaml
name: Your Name
url: https://your-site.example
text_color: "#000000"
link_color: "#0055cc"
border_color: "#000000"
border_style: solid     # or `none` to remove the border entirely
on_link_color: "#ffffff"
background: transparent
font: "Inter, system-ui, sans-serif"
font_size: "16px"
stylesheet: "https://fonts.googleapis.com/css2?family=Inter&display=swap"
```

**2. Query params on the iframe `src`** — same names, override per embed:

```
/embed/you?link_color=%23FF6400&font=Inter,sans-serif
```

Values containing `;`, `{`, `}`, `<` or `>` are ignored, so a param cannot
inject arbitrary CSS.

**3. CSS on the `<iframe>` element itself** — this is the one people miss. You
cannot style the bar from outside, but the iframe is an ordinary element on
your page, so borders, radius, margins and sizing are yours. To give the widget
a border matching your site without imposing it on anyone else's embed, set
`border_style: none` in your YAML and put the border here:

```css
.webring-embed {
  box-sizing: border-box;
  height: 44px;
  border: 1px dashed #000;
  border-radius: 0.4rem;
}
```

### Sizing

The bar is **42px** tall. Use `height: 44px` if you add a 1px border, `42px` if
you do not; taller leaves dead space under the bar, which looks wrong once
there is a border around it. It stays on one line down to at least 375px wide.

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
