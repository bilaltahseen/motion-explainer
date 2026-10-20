---
name: motion-explainer
description: Explain how part of a codebase or system works as an animated, step-through diagram. Packets move along the real request/data path, with narration, payloads, file:line links and "what to change next". Produces a self-contained offline HTML player in ./explainers/<slug>/. Use when the user asks how something works or flows ("how does login work", "walk me through checkout", "what happens when a webhook arrives", "explain this architecture/pipeline/request lifecycle"), asks for an animated/visual/interactive explanation or diagram, or says they're a visual learner. Don't use it for a static image or a quick one-line answer.
---

# motion-explainer

You turn "how does X work?" into a short animated walkthrough. You read the code, cast the components into a Kymo diagram, script the flow step by step, and run one build command.

`SKILL_DIR` below means the directory containing this file. Run scripts as `node "$SKILL_DIR/scripts/…"`. They need Node 18+ and have no npm dependencies.

## Workflow

1. **Scope the question.** Find the trigger and the visible outcome ("user clicks Pay" → "order shows paid"). If the request is vague ("explain the backend"), ask one question or pick the most important flow and say so. Pick a kebab-case slug, e.g. `checkout-flow`.

2. **Read the code that implements it.** Follow the real path: entry point, route/handler, services, queues, stores, third parties. Note file paths and line numbers as you go; they become `code` refs. Don't invent components you didn't see.

3. **Write `explainers/<slug>/diagram.kymo`** in the repo root. Read `references/kymo-cheatsheet.md` first. Rules that matter:
   - 5–9 nodes (max 12), named the way the code names them, with tech in the subtitle.
   - One `layout { a | b | { c , d } }` line in reading order. No coordinates.
   - Edges node-to-node only, one per direction a flow uses. Labels short or omitted.
   - Icons: `grep -i <tech> "$SKILL_DIR/references/icons.txt"`. Prefer the verified list in the cheatsheet.

4. **Write `explainers/<slug>/explainer.json`** following `references/spec-schema.md` and `references/storytelling.md`:
   - 1–4 flows (happy path first, then a failure path if there's an interesting one), each with 4–10 steps.
   - Each step is one hop (`edge: "a->b"`) or one in-node action (`focus: ["a"]`). Narration (`say`) explains **why**, not just what.
   - Give packets realistic but trimmed payloads, with no real secrets.
   - Include `code` refs with real `file` + `line`, relative to the repo root.
   - Add 2–4 `next` actions that answer the user's actual goal.

5. **Build:**
   ```bash
   node "$SKILL_DIR/scripts/build.mjs" explainers/<slug> --open
   ```
   - On `ERROR` lines, fix the spec or diagram and rerun.
   - Fix every `warn` line you reasonably can: missing edges, wrong file paths, Kymo quirks. A warning banner in the player means unfinished work.
   - `icon fetch failed` means that icon isn't on Kymo's CDN. Pick another and rebuild.
   - The SVG is cached by source hash, so editing only `explainer.json` rebuilds instantly and offline.

6. **Report back** in a few lines:
   - the path to `index.html`
   - the flows and what each shows
   - the keyboard keys (← → step, space play, 1–9 flows, click a node)
   - a one-line privacy note: "the diagram source (component names and edge labels, no code) was sent to render.kymo.studio to lay it out; set `MOTION_EXPLAINER_OFFLINE=1` to render locally with built-in icons only."
   Don't paste the JSON back to the user.

## Updating an existing explainer

Edit `explainer.json` or `diagram.kymo` in place and rerun the build. Never hand-edit `index.html` or `diagram.svg`; both are generated.

## Rendering details

- By default the build POSTs `diagram.kymo` to `https://render.kymo.studio/kymo/svg`. This needs no account and allows about 60 requests a minute.
- If the API is unreachable, it falls back to `npx -p kymostudio@0.4 kymo`. The same happens with `--offline` or `MOTION_EXPLAINER_OFFLINE=1`. Brand icons fail locally, so use built-in glyphs when offline.
- The user may have Kymo's MCP server (`mcp.kymo.studio`) connected. It only edits diagrams in their cloud editor and doesn't return SVG, so don't use it for building. Only offer it if they want to fine-tune the layout by hand, then paste the DSL back into `diagram.kymo`.

## Files

| Path | Purpose |
|---|---|
| `scripts/build.mjs` | parse → validate → render (cached) → tag → write `index.html` |
| `scripts/render.mjs` | `.kymo` → SVG (API, falling back to npx) |
| `scripts/tag-svg.mjs` | adds `data-node` / `data-edge` ids and patches Kymo renderer gaps |
| `scripts/validate.mjs` | spec errors and warnings |
| `assets/player.html` | the player template (all CSS/JS inline, strict CSP, no network) |
| `references/*.md` | DSL cheatsheet, spec schema, storytelling guide; `icons.txt` lists icon names |
| `examples/*/` | complete explainers to copy from (`order-queue` and `oauth-login` are the best models) |
