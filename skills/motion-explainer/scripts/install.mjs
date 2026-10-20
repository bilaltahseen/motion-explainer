#!/usr/bin/env node
// Install this skill folder where coding agents look for Agent Skills (SKILL.md).
//
//   node scripts/install.mjs                 detected agents (+ the shared ~/.agents/skills)
//   node scripts/install.mjs --all           every known location
//   node scripts/install.mjs --claude --codex --gemini --cursor --agents
//   node scripts/install.mjs --project [dir] <dir>/.claude/skills and <dir>/.agents/skills
//   node scripts/install.mjs --link          symlink instead of copy (for developing the skill)
//   node scripts/install.mjs --uninstall     remove from the selected locations
//   node scripts/install.mjs --dry-run       print what would happen

import { cpSync, existsSync, lstatSync, readFileSync, rmSync, symlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "motion-explainer";
const HOME = homedir();

// Personal skill folders per agent. `.agents/skills` is the cross-agent location
// read by Codex and used as a fallback by several others.
const TARGETS = {
  claude: { dir: join(HOME, ".claude", "skills"), detect: join(HOME, ".claude") },
  codex: { dir: join(HOME, ".codex", "skills"), detect: join(HOME, ".codex") },
  gemini: { dir: join(HOME, ".gemini", "skills"), detect: join(HOME, ".gemini") },
  cursor: { dir: join(HOME, ".cursor", "skills"), detect: join(HOME, ".cursor") },
  agents: { dir: join(HOME, ".agents", "skills"), detect: null },
};

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const dry = has("--dry-run");
const link = has("--link");

let dests = [];
if (has("--project")) {
  const i = args.indexOf("--project");
  const root = resolve(args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : process.cwd());
  dests = [join(root, ".claude", "skills"), join(root, ".agents", "skills")];
} else {
  const picked = Object.keys(TARGETS).filter((k) => has(`--${k}`));
  const keys = has("--all") ? Object.keys(TARGETS)
    : picked.length ? picked
    : Object.keys(TARGETS).filter((k) => !TARGETS[k].detect || existsSync(TARGETS[k].detect));
  dests = keys.map((k) => TARGETS[k].dir);
}

/** Only replace folders that are ours (or our symlinks) — never someone else's skill. */
function isOurs(path) {
  try {
    if (lstatSync(path).isSymbolicLink()) return true;
    return /^name:\s*motion-explainer\s*$/m.test(readFileSync(join(path, "SKILL.md"), "utf8"));
  } catch {
    return false;
  }
}

// Generated players in examples/ are large and rebuildable; don't ship them.
const filter = (src) => !(basename(src) === "index.html" && src.includes(`${join("examples", "")}`));

let failed = false;
for (const parent of dests) {
  const dest = join(parent, NAME);
  if (resolve(dest) === SKILL_DIR) { console.log(`- ${dest} is this checkout, skipping`); continue; }
  const exists = existsSync(dest) || (() => { try { return lstatSync(dest).isSymbolicLink(); } catch { return false; } })();
  if (exists && !isOurs(dest)) {
    console.log(`✘ ${dest} exists and isn't motion-explainer, leaving it alone`);
    failed = true;
    continue;
  }
  if (has("--uninstall")) {
    if (!exists) { console.log(`- ${dest} not installed`); continue; }
    if (!dry) rmSync(dest, { recursive: true, force: true });
    console.log(`✔ removed ${dest}`);
    continue;
  }
  if (dry) { console.log(`would ${link ? "link" : "copy"} → ${dest}`); continue; }
  mkdirSync(parent, { recursive: true });
  if (exists) rmSync(dest, { recursive: true, force: true });
  if (link) symlinkSync(SKILL_DIR, dest, "dir");
  else cpSync(SKILL_DIR, dest, { recursive: true, filter });
  console.log(`✔ ${link ? "linked" : "installed"} ${dest}`);
}

if (!has("--uninstall") && !dry && !failed) {
  console.log(`\nAsk your agent: "explain how <something> works in this repo, animated". Restart the agent if it was running.`);
}
process.exit(failed ? 1 : 0);
