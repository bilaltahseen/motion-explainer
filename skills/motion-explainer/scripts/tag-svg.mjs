// Post-process Kymo's SVG so the player can address its parts:
//   <g data-node="api" …>       node glyph groups (matched by label, then order)
//   <path data-edge="a->b" …>   edge paths (matched by endpoint geometry)
//   <text data-edge-label="a->b">, <text data-node-label="api">
// It also patches two Kymo JS-renderer gaps: undefined `g-*` gradients (shapes
// render unfilled) and reverse edge pairs drawn on top of each other.

const NODE_G_RE = /<g transform="translate\((-?[\d.]+),\s*(-?[\d.]+)\)" filter="url\(#soft\)">/g;
const NODE_LABEL_RE = /<text class="label" x="(-?[\d.]+)" y="(-?[\d.]+)">([^<]*)<\/text>/g;
const EDGE_PATH_RE = /<path d="([^"]+)"([^>]*?)\/>/g;
const EDGE_LABEL_RE = /<text class="elabel" x="(-?[\d.]+)" y="(-?[\d.]+)">([^<]*)<\/text>/g;
const PAIR_OFFSET = 7; // px each direction of a reverse pair is pushed sideways

const GRADIENTS = {
  "g-face-front": ["#a3e635", "#65a30d"],
  "g-face-top": ["#ecfccb", "#bef264"],
  "g-face-side": ["#65a30d", "#3f6212"],
};
const ACCENTS = {
  orange: ["#fdba74", "#ea580c"],
  blue: ["#93c5fd", "#2563eb"],
  green: ["#bef264", "#4d7c0f"],
  red: ["#fca5a5", "#dc2626"],
};

const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

function matchesFrom(re, text, start = 0, end = text.length) {
  const out = [];
  re.lastIndex = start;
  let m;
  while ((m = re.exec(text)) && m.index < end) out.push(m);
  return out;
}

/** Absolute M/L/C/Q/S/T paths are pure x,y pairs — the only kind we parse or shift. */
const isPairPath = (d) => !/[a-zHVAZ]/.test(d.replace(/[MLCQST]/g, ""));
const pathPoints = (d) => {
  const n = d.match(/-?[\d.]+/g).map(Number);
  return { start: [n[0], n[1]], end: [n[n.length - 2], n[n.length - 1]] };
};
const shiftPath = (d, dx, dy) => {
  let i = 0;
  return d.replace(/-?[\d.]+/g, (v) => +(Number(v) + (i++ % 2 ? dy : dx)).toFixed(1));
};

/**
 * @param {string} svg   Kymo SVG
 * @param {ReturnType<import('./kymo-parse.mjs').parseKymo>} model
 */
export function tagSvg(svg, model) {
  const warnings = [];
  const edits = []; // { at, del, ins } applied back-to-front
  const nodesAt = svg.indexOf('<g class="nodes">');
  const edgesAt = svg.indexOf('<g class="edges">');
  if (nodesAt < 0) {
    return { svg, nodes: {}, edges: [], warnings: ["SVG has no <g class=\"nodes\"> — unknown Kymo output format, nothing tagged"] };
  }

  // ── Nodes ────────────────────────────────────────────────────────────
  const groups = matchesFrom(NODE_G_RE, svg, nodesAt);
  const labels = matchesFrom(NODE_LABEL_RE, svg, nodesAt);
  const unused = [...model.nodes];
  const nodes = {};
  groups.forEach((g, i) => {
    const next = groups[i + 1]?.index ?? svg.length;
    const label = labels.find((l) => l.index > g.index && l.index < next);
    const text = label ? decode(label[3]) : "";
    let k = unused.findIndex((n) => n.label === text);
    if (k < 0) k = 0; // unlabeled or relabeled → fall back to declaration order
    const leaf = unused.splice(k, 1)[0];
    if (!leaf) return warnings.push(`SVG node "${text}" has no matching leaf in the .kymo`);
    nodes[leaf.id] = { x: Number(g[1]), y: Number(g[2]), label: leaf.label, subtitle: leaf.subtitle };
    edits.push({ at: g.index + 2, del: 0, ins: ` data-node="${leaf.id}"` });
    if (label) edits.push({ at: label.index + 5, del: 0, ins: ` data-node-label="${leaf.id}"` });
  });
  for (const n of unused) warnings.push(`node "${n.id}" was not found in the rendered SVG`);

  // ── Edges ────────────────────────────────────────────────────────────
  const edges = [];
  if (edgesAt >= 0) {
    const centers = Object.entries(nodes);
    const nearest = ([x, y]) =>
      centers.reduce((best, [id, c]) => {
        const d = Math.hypot(c.x - x, c.y - y);
        return d < best.d ? { id, d } : best;
      }, { id: null, d: Infinity }).id;

    const paths = matchesFrom(EDGE_PATH_RE, svg, edgesAt, nodesAt);
    const elabels = matchesFrom(EDGE_LABEL_RE, svg, edgesAt, nodesAt);
    const pending = model.edges.map((e) => ({ ...e }));
    const seen = {};

    paths.forEach((p, i) => {
      const d = p[1];
      if (!isPairPath(d)) return warnings.push(`edge path #${i + 1} uses relative/arc commands — left untagged`);
      const { start, end } = pathPoints(d);
      const src = nearest(start);
      const dst = nearest(end);
      const k = pending.findIndex((e) => !e.used && e.src === src && e.dst === dst);
      if (k < 0) return warnings.push(`edge path #${i + 1} (${src} → ${dst}) has no matching edge in the .kymo`);
      pending[k].used = true;
      const base = `${src}->${dst}`;
      seen[base] = (seen[base] || 0) + 1;
      const key = seen[base] > 1 ? `${base}~${seen[base]}` : base;
      const next = paths[i + 1]?.index ?? nodesAt;
      const label = elabels.find((l) => l.index > p.index && l.index < next);
      edges.push({ key, src, dst, d, start, end, label: pending[k].label, pathMatch: p, labelMatch: label });
    });
    for (const e of pending) {
      if (!e.used) warnings.push(`edge ${e.src} --> ${e.dst} (line ${e.line}) was not drawn by Kymo — the player will use a straight line`);
    }

    // Reverse pairs (a->b and b->a) are drawn on the same line; push each to its own side.
    for (const e of edges) {
      const twin = edges.find((o) => o !== e && o.src === e.dst && o.dst === e.src);
      let [nx, ny] = [0, 0];
      if (twin) {
        const [dx, dy] = [e.end[0] - e.start[0], e.end[1] - e.start[1]];
        const len = Math.hypot(dx, dy) || 1;
        [nx, ny] = [(-dy / len) * PAIR_OFFSET, (dx / len) * PAIR_OFFSET];
        e.d = shiftPath(e.d, nx, ny);
      }
      const pm = e.pathMatch;
      edits.push({ at: pm.index, del: pm[0].length, ins: `<path data-edge="${e.key}" d="${e.d}"${pm[2]}/>` });
      if (e.labelMatch) {
        const [, lx, ly, text] = e.labelMatch;
        // Labels of a reverse pair go outside their own line (below for the lower one).
        const x = +(Number(lx) + nx * 2.2).toFixed(1);
        const y = +(Number(ly) + ny * 2.2 + (ny > 0 ? 8 : 0)).toFixed(1);
        edits.push({
          at: e.labelMatch.index,
          del: e.labelMatch[0].length,
          ins: `<text class="elabel" data-edge-label="${e.key}" x="${x}" y="${y}">${text}</text>`,
        });
      }
    }
  }

  // ── Apply edits back-to-front so earlier offsets stay valid ──────────
  edits.sort((a, b) => b.at - a.at);
  let out = svg;
  for (const { at, del, ins } of edits) out = out.slice(0, at) + ins + out.slice(at + del);

  // ── Missing gradients ────────────────────────────────────────────────
  const defined = new Set([...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const missing = [...new Set([...out.matchAll(/url\(#(g-[a-z0-9-]+)\)/g)].map((m) => m[1]))].filter((id) => !defined.has(id));
  if (missing.length) {
    const defs = missing.map((id) => {
      const [a, b] = GRADIENTS[id] || ACCENTS[id.split("-").pop()] || ["#e2e8f0", "#94a3b8"];
      return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    });
    out = out.replace("</defs>", `  ${defs.join("\n    ")}\n  </defs>`);
  }

  // Full-canvas background rects → class so the player can theme / hide them.
  out = out.replace(/<rect (x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" rx="14" fill="(?:#f8fafc|url\(#grid\))")/g, '<rect class="kymo-bg" $1');

  return {
    svg: out,
    nodes,
    edges: edges.map(({ key, src, dst, label, d }) => ({ key, src, dst, label, d })),
    warnings,
  };
}
