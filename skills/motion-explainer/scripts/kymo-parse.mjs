// Minimal .kymo reader: extracts the leaves (nodes), regions and edges that the
// player needs to address. It is NOT a full parser — Kymo itself does layout and
// rendering; we only need ids, labels and edge endpoints in declaration order.

const ID = String.raw`[A-Za-z_][A-Za-z0-9_-]*`;
const LEAF_RE = new RegExp(String.raw`^(${ID})\s+([A-Za-z0-9_-]+)/([A-Za-z0-9_:.-]+)/([A-Za-z0-9_]+)\s+"([^"]*)"\s+"([^"]*)"`);
const REGION_RE = new RegExp(String.raw`^(${ID})\s+(outer|inner)\s+"([^"]*)"`);
const LAYOUT_RE = new RegExp(String.raw`^(${ID})\s+(horizontal|vertical)\s+pos\b`);
const EDGE_RE = new RegExp(String.raw`^(${ID})\s*(-->|==>)\s*(${ID})\s*(?::\s*"([^"]*)")?\s*(\{.*)?$`);

/** Strip a trailing `# comment` that is not inside a quoted string. */
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inStr = !inStr;
    else if (c === "#" && !inStr) return line.slice(0, i);
  }
  return line;
}

export function parseKymo(source) {
  const nodes = [];
  const regions = [];
  const layouts = [];
  const edges = [];
  const warnings = [];
  const meta = {};
  let skipBlock = null; // "bpmn" | "flowchart" | "edge-opts"

  const lines = source.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = stripComment(raw).trim();
    if (!line) return;

    if (skipBlock) {
      if (line === "}" || (skipBlock === "edge-opts" && line.includes("}"))) skipBlock = null;
      return;
    }
    if (/^(bpmn|flowchart)\b.*\{$/.test(line)) {
      skipBlock = line.split(/\s/)[0];
      warnings.push(`line ${lineNo}: \`${skipBlock} { }\` blocks are rendered by Kymo but their nodes can't be animated — use plain leaves + edges instead`);
      return;
    }

    let m;
    if ((m = line.match(/^(title|subtitle)\s*:\s*"([^"]*)"/))) { meta[m[1]] = m[2]; return; }
    if ((m = line.match(EDGE_RE))) {
      const [, src, arrow, dst, label = "", opts] = m;
      edges.push({ src, dst, label, highlight: arrow === "==>", line: lineNo });
      if (opts && !opts.includes("}")) skipBlock = "edge-opts";
      return;
    }
    if ((m = line.match(REGION_RE))) { regions.push({ id: m[1], kind: m[2], label: m[3], line: lineNo }); return; }
    if ((m = line.match(LAYOUT_RE))) { layouts.push({ id: m[1], line: lineNo }); return; }
    if ((m = line.match(LEAF_RE))) {
      nodes.push({ id: m[1], shape: m[2], icon: m[3], accent: m[4], label: m[5], subtitle: m[6], line: lineNo });
    }
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const regionIds = new Set(regions.map((r) => r.id));
  for (const e of edges) {
    for (const end of [e.src, e.dst]) {
      if (regionIds.has(end)) {
        warnings.push(`line ${e.line}: edge ${e.src} --> ${e.dst} ends on region "${end}" — Kymo's JS renderer drops region edges; connect to a node inside it instead`);
      } else if (!nodeIds.has(end)) {
        warnings.push(`line ${e.line}: edge ${e.src} --> ${e.dst} references unknown id "${end}"`);
      }
    }
  }
  if (layouts.length) {
    warnings.push(`named layout containers (${layouts.map((l) => l.id).join(", ")}) render as extra boxes — prefer a region with \`horizontal\`/\`vertical\` or a one-line \`layout { a | b }\` tree`);
  }

  return { meta, nodes, regions, edges, warnings };
}
