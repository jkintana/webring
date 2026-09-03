# webring

A webring of friends who met at the Wisconsin AI Safety Initiative. Members
live as YAML files in `members/`. A scheduled job checks that each site is
carrying the widget, and the ring skips anyone who is down.

Health checks run in GitHub Actions and get committed to `data/status.json`.

The ring order reshuffles daily, sorted by a hash of (slug, UTC date). A new
day's order shows up on the first CI run after UTC midnight.

## Joining

Two things have to happen: you get an entry in this repo, and you put one line
of HTML on your site! Either order works, but you will not appear in the ring
until both are done.

### 1. Get a member entry

Open a pull request adding `members/<your-slug>.yaml`:

```yaml
name: Your Name
url: https://your-site.example
```

The filename minus `.yaml` is your slug, which should consist of lowercase
letters, digits and dashes. Only `name` and `url` are required; everything else
is styling, covered below and in `members/EXAMPLE.yaml.txt`.

You can also just ask Jeremy to add you and skip the PR.

### 2. Put the widget on your site

Paste this wherever you want it, usually the footer, and replace `YOUR-SLUG`:

```html
<iframe src="https://waisi.live/embed/YOUR-SLUG"
        title="waisi.live webring"
        style="width:100%;height:44px;border:0"
        loading="lazy"></iframe>
```

Leave the URL alone. A checker fetches your page and searches for that exact
string, so if you rewrite it, proxy it, or assemble it in JavaScript at runtime,
the checker decides you have not installed it.

### What happens next

A job runs hourly and fetches every member site. The statuses it can report are
listed at the bottom of this file.

Until it finds your embed, the index lists you under Inactive and the ring
routes around you, so nobody clicking prev or next hits a dead end.

## Styling the widget

Your own CSS cannot reach inside the widget. It is a cross-origin iframe, so no
selector you write will touch the bar. You have three options:

1. Your member YAML, which applies everywhere your embed appears:

   ```yaml
   name: Your Name
   url: https://your-site.example
   text_color: "#000000"
   link_color: "#0055cc"
   border_color: "#000000"
   border_style: solid     # or `none` to drop the border entirely
   on_link_color: "#ffffff"
   background: transparent
   font: "Inter, system-ui, sans-serif"
   font_size: "16px"
   stylesheet: "https://fonts.googleapis.com/css2?family=Inter&display=swap"
   ```

2. Query params on the iframe `src`, same names, overriding per embed:

   ```
   /embed/you?link_color=%23FF6400&font=Inter,sans-serif
   ```

   Values containing `;`, `{`, `}`, `<` or `>` are ignored, so a param cannot
   inject CSS.

3. CSS on the `<iframe>` element itself. The bar inside is out of reach, but the
   iframe is an ordinary element on your page, so its border, radius, margins
   and size are yours. If you want a border that matches your site without
   forcing it on anyone else's embed, set `border_style: none` in your YAML and
   put the border out here:

   ```css
   .webring-embed {
     box-sizing: border-box;
     height: 44px;
     border: 1px dashed #000;
     border-radius: 0.4rem;
   }
   ```

## Local development

```bash
npm install
npm run build        # writes dist/
npm run dev          # build, then serve dist/ at http://localhost:4444
npm run healthcheck  # hit every member site, rewrite data/status.json
```

`npm run healthcheck` does nothing while `config.json` still holds the
placeholder `siteUrl`, since it searches for `<siteUrl>/embed/<slug>`, a string
that only exists once you set your domain.

## Health statuses

| status | in the ring? | meaning |
| --- | --- | --- |
| `ok` | yes | embedding the current domain |
| `ok_legacy_url` | yes | embedding a domain listed in `previousSiteUrls` |
| `site_unreachable` | no | fetch failed, returned non-2xx, or timed out |
| `no_webring_embed` | no | the page loaded but no embed URL is on it |
| `slug_mismatch` | no | an embed URL is there for somebody else's slug |
