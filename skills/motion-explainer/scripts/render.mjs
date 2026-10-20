#!/usr/bin/env node
// .kymo source → SVG string.
// Primary: Kymo's public render API (no auth, ~60 req/min, embeds brand icons).
// Fallback: the local `kymostudio` npm CLI via npx (built-in icons only).
// MOTION_EXPLAINER_OFFLINE=1 (or { offline: true }) skips the network entirely.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const API = process.env.KYMO_RENDER_URL || "https://render.kymo.studio/kymo/svg";
const NPM_SPEC = process.env.KYMO_NPM_SPEC || "kymostudio@0.4";
const run = promisify(execFile);

async function renderViaApi(source) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: source,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (res.status >= 400 && res.status < 500 && res.status !== 429) {
    // The source itself is wrong (syntax, unknown icon…) — a local render won't fix it.
    const icon = /icon fetch failed: (\S+)/.exec(body);
    const hint = icon ? ` — that icon is listed but not served by Kymo's CDN; pick another from references/icons.txt` : "";
    throw Object.assign(new Error(`render API rejected diagram.kymo (${res.status}): ${body.slice(0, 300).trim()}${hint}`), { fatal: true });
  }
  if (!res.ok) throw new Error(`render API ${res.status}: ${body.slice(0, 200)}`);
  if (!body.includes("<svg")) throw new Error("render API returned no <svg>");
  return body;
}

async function renderViaNpx(source) {
  const dir = await mkdtemp(join(tmpdir(), "motion-explainer-"));
  try {
    const src = join(dir, "diagram.kymo");
    const out = join(dir, "diagram.svg");
    await writeFile(src, source);
    // The package ships two bins (kymo, kymo-icons), so name the one we want.
    await run("npx", ["-y", "-p", NPM_SPEC, "kymo", src, out], { timeout: 120_000 });
    return await readFile(out, "utf8");
  } catch (err) {
    const msg = String(err.stderr || err.message).trim().split("\n").filter((l) => !/complete log of this run/.test(l)).join("\n");
    const hint = /parse URL from icons-manifest/.test(msg)
      ? " (the local kymostudio CLI can't load file-backed icons like onprem-redis; use built-in icons offline, or render online)"
      : "";
    throw new Error(`local kymostudio failed: ${msg.split("\n").pop()}${hint}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** @returns {Promise<{svg: string, engine: "api" | "npx"}>} */
export async function renderKymo(source, { offline = process.env.MOTION_EXPLAINER_OFFLINE === "1" } = {}) {
  if (!offline) {
    try {
      return { svg: await renderViaApi(source), engine: "api" };
    } catch (err) {
      if (err.fatal) throw err;
      console.warn(`! ${err.message} — falling back to local npx ${NPM_SPEC}`);
    }
  }
  return { svg: await renderViaNpx(source), engine: "npx" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error("usage: render.mjs <diagram.kymo> [out.svg]");
    process.exit(2);
  }
  try {
    const { svg, engine } = await renderKymo(await readFile(input, "utf8"));
    if (output) await writeFile(output, svg);
    else process.stdout.write(svg);
    console.error(`rendered via ${engine}`);
  } catch (err) {
    console.error(`ERROR ${err.message}`);
    process.exit(1);
  }
}
