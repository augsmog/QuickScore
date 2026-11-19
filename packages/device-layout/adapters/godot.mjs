// Godot adapter (Locker Room Defense and any other Godot 4 game).
// Input is the JSON written by adapters/godot/dump_layout.gd, run inside the
// exported/editor build at the device's window size. Rects arrive in canvas
// (stretch) units; this converts them to the config's logical device units so
// the same 44pt / 48dp rules apply as on SnapScore.
import {SNAPSHOT_SCHEMA} from '../src/rules.mjs';

export const GODOT_DUMP_SCHEMA = 'device-layout/godot-dump/v1';
const ASPECT_TOLERANCE = 0.01;

export function fromGodotDump(dump, device) {
  if (dump?.schema !== GODOT_DUMP_SCHEMA) throw new Error(`godot dump schema must be "${GODOT_DUMP_SCHEMA}"`);
  if (dump.device !== device.id) throw new Error(`dump was captured for "${dump.device}", not "${device.id}"`);
  const vw = dump.viewport?.width, vh = dump.viewport?.height;
  if (!(vw > 0 && vh > 0)) throw new Error('dump.viewport needs positive width/height (visible rect in canvas units)');
  const sx = device.width / vw, sy = device.height / vh;
  // canvas_items + expand keeps a uniform scale; a mismatch means the dump was
  // taken at a window size that does not match this device's aspect ratio.
  if (Math.abs(sx - sy) / Math.max(sx, sy) > ASPECT_TOLERANCE) {
    throw new Error(`aspect mismatch: viewport ${vw}x${vh} vs device ${device.width}x${device.height}`);
  }
  const toRect = ([x, y, w, h]) => ({left: x * sx, top: y * sy, right: (x + w) * sx, bottom: (y + h) * sy});
  const nodes = (dump.nodes ?? []).filter(n => n.visible !== false);
  const interactive = nodes.filter(n => n.interactive);
  const ids = new Map(interactive.map((n, i) => [n.path, i]));
  const ancestorTargets = path => interactive.filter(t => path !== t.path && path.startsWith(t.path + '/')).map(t => ids.get(t.path));

  const targets = interactive.map((n, i) => ({
    id: i,
    name: n.name ?? n.text ?? n.path,
    ...toRect(n.rect),
    ...(n.parent_interactive && ids.has(n.parent_interactive) ? {parentId: ids.get(n.parent_interactive)} : {}),
    unsupported: Boolean(n.rotated),
  }));
  const spans = t => t.left <= 0.5 && t.top <= 0.5 && t.right >= device.width - 0.5 && t.bottom >= device.height - 0.5;
  for (const t of targets) t.backdrop = spans(t) && targets.length > 1;

  const texts = nodes
    .filter(n => !n.interactive && typeof n.text === 'string' && n.text.trim())
    .map(n => ({name: n.text.trim().slice(0, 80), ...toRect(n.rect), owners: ancestorTargets(n.path), unsupported: Boolean(n.rotated)}));

  return {schema: SNAPSHOT_SCHEMA, device: device.id, screen: dump.screen, screenshot: dump.screenshot ?? null, source: 'godot/dump_layout.gd', targets, texts};
}
