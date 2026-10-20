# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor, Gemini CLI, …) working **on** this repository. To **use** the skill, read [skills/motion-explainer/SKILL.md](skills/motion-explainer/SKILL.md).

## What this is

`motion-explainer` is an [Agent Skill](https://agentskills.io): a `SKILL.md` plus plain Node scripts. Given a question like "how does checkout work?", the agent writes two files. The skill then turns them into a self-contained, animated HTML walkthrough, with packets moving along the real request path, narration, payloads, `file:line` links and a "what to do next" card.

```
explainers/<slug>/diagram.kymo     components + edges (Kymo DSL)         ← agent writes
explainers/<slug>/explainer.json   flows → steps → narration/packets/code ← agent writes
explainers/<slug>/diagram.svg      Kymo render, cached by source hash     ← generated
explainers/<slug>/index.html       the player                             ← generated
```

[Kymo](https://github.com/kymostudio/kymostudio) does layout and rendering. Everything else (step model, tagging, player) lives here.

## Layout

```
skills/motion-explainer/      ← the distributable unit; install.mjs copies exactly this folder
  SKILL.md                    agent-facing workflow (frontmatter name must equal the folder name)
  scripts/build.mjs           parse → validate → render (cached) → tag → inline into player
  scripts/render.mjs          .kymo → SVG via render.kymo.studio, falling back to `npx -p kymostudio@0.4 kymo`
  scripts/kymo-parse.mjs      minimal .kymo reader (ids, labels, edges); NOT a full parser
  scripts/tag-svg.mjs         adds data-node / data-edge / *-label attributes, patches renderer gaps
  scripts/validate.mjs        explainer.json errors (block) and warnings (shown in player)
  scripts/install.mjs         copies or links the skill into ~/.claude, ~/.codex, ~/.gemini, ~/.cursor, ~/.agents
  assets/player.html          the template: all CSS/JS inline, strict CSP, two slots
  references/                 docs the agent reads while authoring (cheatsheet, schema, storytelling, icons.txt)
  examples/<name>/            reference explainers; their diagram.svg doubles as an offline test fixture
scripts/check.mjs             repo self-test
docs/make-hero.mjs           regenerates the README hero (docs/how-it-works.svg) from docs/how-it-works.kymo
```

## Commands

```bash
node scripts/check.mjs                         # self-test: SKILL.md + every example builds with zero warnings
node scripts/check.mjs --render                # same, but re-render through the Kymo API
node scripts/check.mjs --render --offline      # through local npx kymostudio; brand-icon examples are EXPECTED to fail here
node skills/motion-explainer/scripts/build.mjs skills/motion-explainer/examples/order-queue --open
node skills/motion-explainer/scripts/install.mjs --link   # dev: symlink this checkout into your agents
```

Run `node scripts/check.mjs` after any change to `scripts/` or `assets/`. It must print `all checks passed`.

## Conventions

- **Zero dependencies.** Scripts are Node ≥ 18 ESM using only built-ins and global `fetch`. Don't add a `package.json` dependency; the skill must run straight after being copied.
- **The player is one file with no network access.** `player.html` keeps its CSP (`default-src 'none'`). No CDN scripts or web fonts. Images only as `data:` URIs.
- **Template slots** `<!--KYMO_SVG-->` and `/*EXPLAINER_DATA*/null` each appear exactly once in `player.html`. Don't mention them literally anywhere else in the file; `build.mjs` replaces the first match.
- **Player ↔ SVG contract:** `<g data-node="id">`, `<text data-node-label="id">`, `<path data-edge="src->dst[~n]">`, `<text data-edge-label="…">`, and `.kymo-bg` on the background rects. Changing an attribute name means changing both `tag-svg.mjs` and `player.html`.
- **Generated files are never hand-edited** (`index.html`, `diagram.svg`, `.render-cache.json`). Examples commit `diagram.svg` and `.render-cache.json` so `check.mjs` runs offline. Rebuild with `--render` when you change a `.kymo`.
- **Errors vs warnings:** an error means the player would be wrong or broken. A warning means it works but is degraded or sloppy. Warnings appear in the player's banner, so keep them actionable and name the file or line.
- Match the existing style: 2-space indent, double quotes, short "why" comments, no JSDoc boilerplate beyond `@param` on exported functions.

## Kymo JS-renderer quirks we work around

The render API runs `kymostudio` 0.4.x (JS engine). Each quirk below and where it's handled:

| Quirk | Handled in |
|---|---|
| Refers to `url(#g-box-orange)` etc. but never defines the gradients, so shapes render unfilled | `tag-svg.mjs` injects them |
| `a→b` and `b→a` drawn on the same line, labels overlapping | `tag-svg.mjs` offsets each by ±7px |
| Subtitles dropped | player draws `.me-sub` under labels |
| Edges to a region id silently dropped | `kymo-parse.mjs` warns; player falls back to a straight ghost line |
| Edge anchor options (`src=right(…)`) ignored | documented in cheatsheet as "don't use" |
| Named layout containers draw a stray box | `kymo-parse.mjs` warns; use `layout { a | b }` |
| Accent colour mostly ignored | documented |
| Some manifest icons 403 on the CDN (API returns 400 `icon fetch failed`) | `render.mjs` surfaces a hint; cheatsheet lists verified icons |
| `npx kymostudio` has two bins; local CLI can't load file-backed icons (seen on Node 26: "Failed to parse URL from icons-manifest.json") | `render.mjs` uses `-p … kymo` and explains the icon failure |

If Kymo changes its SVG markup, the regexes at the top of `tag-svg.mjs` are the place to start. `check.mjs --render` will catch the regression as untagged nodes or edges.

## Verifying player changes

Automated checks don't cover visuals. After editing `player.html`:
1. Rebuild an example (`build.mjs … --open`, or `check.mjs`).
2. In a browser, step through a flow with ← and →. Check that packets ride the edges, focus and dim follow the step, and the camera keeps context. Play with space.
3. Check dark and light (the `t` key) and a 390px-wide viewport, where there must be no horizontal scroll.
4. Check the console is clean.

## Releasing / distribution

Users install with `node skills/motion-explainer/scripts/install.mjs` from a clone, or copy `skills/motion-explainer/` into any agent's skills folder. Nothing else in the repo is needed at runtime.
