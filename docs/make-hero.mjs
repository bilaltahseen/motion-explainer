#!/usr/bin/env node
// Builds docs/how-it-works.svg (the README hero): the Kymo-rendered pipeline
// diagram, tagged by the skill's own tagger, with SMIL packets that travel the
// real edge paths in sequence. SMIL/CSS animation plays inside <img> on GitHub.
//
//   node docs/make-hero.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKymo } from "../skills/motion-explainer/scripts/kymo-parse.mjs";
import { renderKymo } from "../skills/motion-explainer/scripts/render.mjs";
import { tagSvg } from "../skills/motion-explainer/scripts/tag-svg.mjs";

const DOCS = dirname(fileURLToPath(import.meta.url));

// [edge, packet label]. Played in order, then the whole loop restarts.
const SEQUENCE = [
  ["you->agent", "how does login work?"],
  ["agent->code", "read"],
  ["agent->kymo", ".kymo"],
  ["agent->spec", ".json"],
  ["kymo->build", ""],
  ["spec->build", ""],
  ["build->render", "POST"],
  ["render->build", "SVG"],
  ["build->player", "index.html"],
];
const HOP = 1.15; // seconds per hop
const HOLD = 2.2; // pause at the end before looping
const TOTAL = SEQUENCE.length * HOP + HOLD;
const t = (s) => +(s / TOTAL).toFixed(4);

const source = await readFile(join(DOCS, "how-it-works.kymo"), "utf8");
const model = parseKymo(source);
const { svg: raw } = await renderKymo(source);
const tagged = tagSvg(raw, model);
let svg = tagged.svg.replace(/^<\?xml[^>]*>\s*/, "");

// Give each edge path an id so <mpath> can reference it.
const ids = {};
tagged.edges.forEach((e, i) => {
  ids[e.key] = `e${i}`;
  svg = svg.replace(`<path data-edge="${e.key}"`, `<path id="e${i}" data-edge="${e.key}"`);
});

// Kymo's JS renderer drops subtitles; draw them under each label.
for (const n of model.nodes) {
  const lab = new RegExp(`data-node-label="${n.id}"[^>]*x="([\\d.-]+)" y="([\\d.-]+)"`).exec(svg);
  if (!lab || !n.subtitle) continue;
  const end = svg.indexOf("</text>", lab.index) + 7;
  svg = svg.slice(0, end) + `<text class="sub" x="${lab[1]}" y="${Number(lab[2]) + 15}">${n.subtitle}</text>` + svg.slice(end);
}

const packets = [];
SEQUENCE.forEach(([edge, label], i) => {
  const id = ids[edge];
  if (!id) throw new Error(`edge ${edge} not drawn`);
  const [s, e] = [t(i * HOP), t(i * HOP + HOP * 0.85)];
  const after = t(i * HOP + HOP * 0.95);
  const w = label.length * 6.6 + 14;
  packets.push(`
  <g opacity="0">
    <animate attributeName="opacity" dur="${TOTAL}s" repeatCount="indefinite" calcMode="discrete"
             keyTimes="0;${s};${after};1" values="0;1;0;0"/>
    <animateMotion dur="${TOTAL}s" repeatCount="indefinite" calcMode="linear"
                   keyPoints="0;0;1;1" keyTimes="0;${s};${e};1"><mpath href="#${id}"/></animateMotion>
    ${label ? `<rect x="${-w / 2}" y="-29" width="${w}" height="18" rx="7" class="pill"/><text class="ptext" y="-16.5">${label}</text>` : ""}
    <circle r="6.5" class="dot"/>
  </g>`);
  // Highlight the edge while its packet is travelling (a copy of the path:
  // <use> can't override the original's stroke attribute).
  const d = tagged.edges.find((x) => x.key === edge).d;
  packets.push(`
  <path d="${d}" class="lit" opacity="0">
    <animate attributeName="opacity" dur="${TOTAL}s" repeatCount="indefinite" calcMode="discrete"
             keyTimes="0;${s};${after};1" values="0;1;0;0"/>
  </path>`);
  // Pulse the destination node on arrival: hidden until `e`, then grow and fade.
  const dst = tagged.nodes[edge.split("->")[1]];
  const fade = t(i * HOP + HOP * 1.5);
  packets.push(`
  <circle cx="${dst.x}" cy="${dst.y}" r="30" class="ring" opacity="0">
    <animate attributeName="r" dur="${TOTAL}s" repeatCount="indefinite" keyTimes="0;${e};${fade};1" values="30;30;58;58"/>
    <animate attributeName="opacity" dur="${TOTAL}s" repeatCount="indefinite" keyTimes="0;${s};${e};${fade};1" values="0;0;.9;0;0"/>
  </circle>`);
});

const style = `
  <style>
    .sub { fill: #64748b; font-size: 10.5px; text-anchor: middle; }
    .dot { fill: #f59e0b; stroke: #fff; stroke-width: 2.5; }
    .pill { fill: #f59e0b; }
    .ptext { fill: #1c1917; font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; text-anchor: middle; }
    .lit { fill: none; stroke: #4f46e5; stroke-width: 3; stroke-dasharray: 7 6; animation: flow .6s linear infinite; }
    .ring { fill: none; stroke: #4f46e5; stroke-width: 2.5; }
    @keyframes flow { to { stroke-dashoffset: -13; } }
    @media (prefers-reduced-motion: reduce) { .lit { animation: none; } }
  </style>`;

svg = svg.replace("</defs>", `</defs>${style}`).replace(/<\/svg>\s*$/, `${packets.join("")}\n</svg>\n`);
await writeFile(join(DOCS, "how-it-works.svg"), svg);
console.log(`✔ docs/how-it-works.svg (${(svg.length / 1024).toFixed(1)} KB, ${TOTAL.toFixed(1)}s loop)`);
