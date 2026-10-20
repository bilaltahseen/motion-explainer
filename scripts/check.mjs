#!/usr/bin/env node
// Repo self-test: SKILL.md frontmatter + every example builds warning-free.
//   node scripts/check.mjs            uses each example's cached diagram.svg (offline-safe)
//   node scripts/check.mjs --render   re-renders through the Kymo API (or npx with --offline)

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL = join(REPO, "skills", "motion-explainer");
const { build } = await import(join(SKILL, "scripts", "build.mjs"));
const { parseKymo } = await import(join(SKILL, "scripts", "kymo-parse.mjs"));

const args = process.argv.slice(2);
let failures = 0;
const fail = (msg) => { failures++; console.log(`✘ ${msg}`); };
const pass = (msg) => console.log(`✔ ${msg}`);

// ── SKILL.md frontmatter (Agent Skills spec: name = dir name, description ≤ 1024 chars) ──
const skillMd = readFileSync(join(SKILL, "SKILL.md"), "utf8");
const fm = /^---\n([\s\S]*?)\n---\n/.exec(skillMd);
if (!fm) fail("SKILL.md: missing YAML frontmatter");
else {
  const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1].trim();
  const desc = /^description:\s*(.+)$/m.exec(fm[1])?.[1].trim() ?? "";
  if (name !== "motion-explainer") fail(`SKILL.md: name "${name}" must match the directory "motion-explainer"`);
  else if (!desc || desc.length > 1024) fail(`SKILL.md: description must be 1–1024 chars (is ${desc.length})`);
  else pass(`SKILL.md frontmatter (description ${desc.length} chars)`);
}

// ── Player template slots ──
const player = readFileSync(join(SKILL, "assets", "player.html"), "utf8");
for (const slot of ["<!--KYMO_SVG-->", "/*EXPLAINER_DATA*/null"]) {
  const n = player.split(slot).length - 1;
  if (n !== 1) fail(`player.html: slot ${slot} must appear exactly once (found ${n})`);
}

// ── Examples ──
const examplesDir = join(SKILL, "examples");
for (const name of readdirSync(examplesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const dir = join(examplesDir, name);
  try {
    const r = await build(dir, { strict: true, cache: !args.includes("--render"), offline: args.includes("--offline") });
    if (!r.ok) {
      fail(`examples/${name}`);
      [...r.errors, ...r.warnings].forEach((m) => console.log(`    ${m}`));
      continue;
    }
    const html = readFileSync(r.outPath, "utf8");
    const model = parseKymo(readFileSync(join(dir, "diagram.kymo"), "utf8"));
    const tagged = new Set([...html.matchAll(/<g data-node="([^"]+)"/g)].map((m) => m[1]));
    const edges = new Set([...html.matchAll(/<path data-edge="([^"]+)"/g)].map((m) => m[1]));
    const missing = model.nodes.filter((n) => !tagged.has(n.id)).map((n) => n.id);
    if (missing.length) fail(`examples/${name}: untagged nodes ${missing.join(", ")}`);
    else if (edges.size !== model.edges.length) fail(`examples/${name}: ${edges.size}/${model.edges.length} edges tagged`);
    else if (html.includes("<!--KYMO_SVG-->") || html.includes("/*EXPLAINER_DATA*/null")) fail(`examples/${name}: unfilled template slot`);
    else pass(`examples/${name} (${r.stats.flows} flows, ${r.stats.steps} steps, ${tagged.size} nodes, ${edges.size} edges, ${r.engine})`);
  } catch (err) {
    fail(`examples/${name}: ${err.message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
