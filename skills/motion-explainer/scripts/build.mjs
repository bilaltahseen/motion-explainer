#!/usr/bin/env node
// explainers/<slug>/{explainer.json, diagram.kymo}  →  explainers/<slug>/index.html
//
//   node build.mjs <explainer-dir> [--offline] [--open] [--strict] [--no-cache]
//
// Pipeline: parse .kymo → validate spec → render SVG (cached by source hash)
//           → tag SVG → inline SVG + spec into assets/player.html.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKymo } from "./kymo-parse.mjs";
import { renderKymo } from "./render.mjs";
import { tagSvg } from "./tag-svg.mjs";
import { validateSpec } from "./validate.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(SKILL_DIR, "assets", "player.html");

function findRoot(start) {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return process.cwd();
  }
}

/** JSON that is safe inside an inline <script>. */
const scriptJson = (v) =>
  JSON.stringify(v).replace(/</g, "\\u003c").replace(new RegExp("\\u2028", "g"), "\\u2028").replace(new RegExp("\\u2029", "g"), "\\u2029");

function openInBrowser(file) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [file]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", file]]
    : ["xdg-open", [file]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

export async function build(dir, { offline, strict, cache = true } = {}) {
  dir = resolve(dir);
  const specPath = join(dir, "explainer.json");
  if (!existsSync(specPath)) throw new Error(`no explainer.json in ${dir}`);
  let spec;
  try {
    spec = JSON.parse(await readFile(specPath, "utf8"));
  } catch (err) {
    throw new Error(`explainer.json is not valid JSON: ${err.message}`);
  }
  const kymoPath = join(dir, spec.diagram || "diagram.kymo");
  if (!existsSync(kymoPath)) throw new Error(`diagram not found: ${kymoPath}`);
  const source = await readFile(kymoPath, "utf8");
  const root = spec.root ? resolve(dir, spec.root) : findRoot(dir);

  const model = parseKymo(source);
  const { errors, warnings } = validateSpec(spec, model, root);
  warnings.unshift(...model.warnings.map((w) => `diagram.kymo ${w}`));
  if (errors.length) return { ok: false, errors, warnings };

  // Render, re-using diagram.svg while the .kymo source is unchanged (rate limits).
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const svgPath = join(dir, "diagram.svg");
  const cachePath = join(dir, ".render-cache.json");
  let svg, engine;
  if (cache && existsSync(svgPath) && existsSync(cachePath)) {
    const c = JSON.parse(await readFile(cachePath, "utf8"));
    if (c.hash === hash) {
      engine = c.engine;
      svg = await readFile(svgPath, "utf8");
    }
  }
  if (!svg) {
    ({ svg, engine } = await renderKymo(source, { offline }));
    await writeFile(svgPath, svg);
    await writeFile(cachePath, JSON.stringify({ hash, engine }) + "\n");
  }

  const tagged = tagSvg(svg, model);
  warnings.push(...tagged.warnings);
  if (strict && warnings.length) return { ok: false, errors: ["--strict: warnings present"], warnings };

  const data = {
    spec,
    nodes: tagged.nodes,
    edges: tagged.edges.map(({ key, src, dst, label }) => ({ key, src, dst, label })),
    warnings,
    root,
    engine,
    builtAt: new Date().toISOString(),
  };
  const template = await readFile(TEMPLATE, "utf8");
  const html = template
    .replace("<!--KYMO_SVG-->", () => tagged.svg.replace(/^<\?xml[^>]*>\s*/, ""))
    .replace("/*EXPLAINER_DATA*/null", () => scriptJson(data))
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(spec.title)}</title>`);
  const outPath = join(dir, "index.html");
  await writeFile(outPath, html);

  const steps = spec.flows.reduce((n, f) => n + f.steps.length, 0);
  return { ok: true, outPath, engine, warnings, errors: [], stats: { flows: spec.flows.length, steps, nodes: model.nodes.length } };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: build.mjs <explainer-dir> [--offline] [--open] [--strict] [--no-cache]");
    process.exit(2);
  }
  try {
    const r = await build(dir, {
      offline: args.includes("--offline") || process.env.MOTION_EXPLAINER_OFFLINE === "1",
      strict: args.includes("--strict"),
      cache: !args.includes("--no-cache"),
    });
    for (const w of r.warnings) console.log(`  warn  ${w}`);
    for (const e of r.errors) console.log(`  ERROR ${e}`);
    if (!r.ok) process.exit(1);
    const rel = relative(process.cwd(), r.outPath) || r.outPath;
    console.log(`✔ ${rel}  (${r.stats.flows} flows, ${r.stats.steps} steps, ${r.stats.nodes} nodes; rendered via ${r.engine === "api" ? "render.kymo.studio" : "local kymostudio"})`);
    if (args.includes("--open")) openInBrowser(r.outPath);
  } catch (err) {
    console.error(`  ERROR ${err.message}`);
    process.exit(1);
  }
}
