#!/usr/bin/env node
// Where the New Contest list is, and how far it has moved between two native UI dumps.
// Used by run-android-compact.sh for the scroll-only reveal captures and for putting the list back.
//   wizard-scroll-probe.mjs area  <dump>            -> "<x> <top> <bottom>" in pixels
//   wizard-scroll-probe.mjs delta <before> <after>  -> "<pixels>" (positive: content moved down)
// A dump is a `maestro hierarchy` JSON or an `adb exec-out uiautomator dump` XML.
// Exit 3 means "no answer": the caller must not guess. Covered by lib/wizard-scroll-probe.test.mjs.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const SCROLL_ID = 'contest-scroll';
const BOUNDS = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;
const rect = (text) => { const m = BOUNDS.exec(text ?? ''); return m ? { left: +m[1], top: +m[2], right: +m[3], bottom: +m[4] } : null; };
const shortId = (id) => String(id ?? '').replace(/^.*:id\//, '');

// -> [{ id, left, top, right, bottom }] for every node that has an id and bounds.
export function parseDump(text) {
  const nodes = [];
  const add = (id, bounds) => { const r = rect(bounds); if (r && shortId(id)) nodes.push({ id: shortId(id), ...r }); };
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    (function walk(n) { if (!n || typeof n !== 'object') return; add(n.attributes?.['resource-id'], n.attributes?.bounds); (n.children ?? []).forEach(walk); })(JSON.parse(trimmed));
  } else if (trimmed.startsWith('<')) {
    for (const tag of trimmed.match(/<node\b[^>]*>/g) ?? []) add(/\bresource-id="([^"]*)"/.exec(tag)?.[1], /\bbounds="([^"]*)"/.exec(tag)?.[1]);
  } else {
    throw new Error('not a UI dump (expected maestro hierarchy JSON or uiautomator XML)');
  }
  return nodes;
}
const unique = (nodes) => { const count = new Map(); for (const n of nodes) count.set(n.id, (count.get(n.id) ?? 0) + 1); return nodes.filter((n) => count.get(n.id) === 1); };

export function scrollArea(nodes) {
  const found = nodes.filter((n) => n.id === SCROLL_ID);
  if (found.length !== 1 || found[0].bottom <= found[0].top) return null;
  return { x: Math.round((found[0].left + found[0].right) / 2), top: found[0].top, bottom: found[0].bottom };
}

// Measured only from controls that are whole (same width and height) in both dumps, strictly
// inside the list in both, and that all agree to the pixel-pair (2px for rounding).
export function scrollDelta(before, after) {
  const area = scrollArea(before); const areaAfter = scrollArea(after);
  if (!area || !areaAfter || area.top !== areaAfter.top || area.bottom !== areaAfter.bottom) return null;
  const then = new Map(unique(before).map((n) => [n.id, n]));
  const inside = (n) => n.top > area.top && n.bottom < area.bottom;
  const moves = [];
  for (const now of unique(after)) {
    const was = then.get(now.id);
    if (!was || now.id === SCROLL_ID || !inside(was) || !inside(now)) continue;
    if (was.right - was.left !== now.right - now.left || was.bottom - was.top !== now.bottom - now.top || was.left !== now.left) continue;
    moves.push(now.top - was.top);
  }
  if (moves.length === 0) return null;
  moves.sort((a, b) => a - b);
  if (moves[moves.length - 1] - moves[0] > 2) return null;
  return moves[Math.floor(moves.length / 2)];
}

function main([command, ...files]) {
  const read = (file) => parseDump(readFileSync(file, 'utf8'));
  try {
    if (command === 'area' && files.length === 1) {
      const area = scrollArea(read(files[0]));
      if (!area) process.exit(3);
      console.log(`${area.x} ${area.top} ${area.bottom}`);
    } else if (command === 'delta' && files.length === 2) {
      const delta = scrollDelta(read(files[0]), read(files[1]));
      if (delta === null) process.exit(3);
      console.log(String(delta));
    } else {
      console.error('usage: wizard-scroll-probe.mjs area <dump> | delta <before> <after>');
      process.exit(2);
    }
  } catch (error) {
    console.error(`wizard-scroll-probe: ${error.message}`);
    process.exit(3);
  }
}
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
