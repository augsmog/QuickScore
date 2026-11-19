// device-layout/v1 adapter — Godot 4.5 (Locker Room Defense). Pure transform: the
// snapshot JSON emitted by a GDScript autoload that walks the `Control` tree →
// normalized element tree (schema.mjs ELEMENT_NODE_SCHEMA).
//
// This module performs NO Godot execution (lane rule: LRD = unit/static checks only,
// never a Godot cohort/headless batch or export). The autoload is expected to emit, per
// Control node:
//   {name, class, visible, rect:{position:{x,y}, size:{x,y}}, text, mouse_filter,
//    disabled, pressed, children:[...]}
// `mouse_filter` is Godot's hit-testing mode: 0=STOP, 1=PASS, 2=IGNORE. STOP/PASS are
// interactive (receive input); IGNORE is not. §F requires real rendered mobile exports
// with touch journeys for acceptance — desktop Xvfb/lavapipe geometry is supplemental —
// but the geometry/vision contract this tree feeds is platform-identical.

export const ADAPTER = 'godot-control';

const INTERACTIVE_CLASS = /Button|CheckBox|CheckButton|LineEdit|TextEdit|Slider|OptionButton|TabBar|ItemList|Tree/;
const MOUSE_FILTER_IGNORE = 2;

function roleFor(cls) {
  if (/CheckButton|CheckBox/.test(cls)) return 'switch';
  if (/LineEdit|TextEdit/.test(cls)) return 'input';
  if (/Button|OptionButton/.test(cls)) return 'button';
  if (/Label|RichTextLabel/.test(cls)) return 'text';
  return 'container';
}
function isInteractive(n) {
  if (n.mouse_filter === MOUSE_FILTER_IGNORE) return false;
  if (n.disabled === true) return false;
  return INTERACTIVE_CLASS.test(String(n.class || ''));
}
function rectOf(n) {
  const pos = n.rect?.position || { x: 0, y: 0 };
  const size = n.rect?.size || { x: 0, y: 0 };
  return { x: Number(pos.x) || 0, y: Number(pos.y) || 0, width: Math.max(0, Number(size.x) || 0), height: Math.max(0, Number(size.y) || 0) };
}

// Godot rect positions are relative to the parent Control; accumulate to absolute so
// the geometry layer (which assumes absolute coordinates) is correct. LRD runs
// landscape with a stretch config — the snapshot is expected in post-stretch logical
// units, which the adapter forwards unchanged (§F: respect LRD landscape/stretch).
export function godotControlToTree(root, { idPrefix = '' } = {}) {
  let counter = 0;
  const walk = (n, origin, path) => {
    const local = rectOf(n);
    const bbox = { x: origin.x + local.x, y: origin.y + local.y, width: local.width, height: local.height };
    const role = roleFor(String(n.class || ''));
    const id = n.name ? String(n.name) : `${path}:${role}:${counter++}`;
    const visible = n.visible !== false;
    const interactive = visible && isInteractive(n);
    const el = {
      id: String(idPrefix ? `${idPrefix}/${id}` : id),
      role,
      text: n.text != null ? String(n.text) : null,
      bbox,
      hitRegion: interactive ? { ...bbox } : null,
      scrollState: /ScrollContainer/.test(String(n.class || '')) ? { scrollable: true, scrollX: 0, scrollY: 0, contentWidth: bbox.width, contentHeight: bbox.height } : null,
      clip: null,
      children: (n.children || []).filter((c) => c.visible !== false).map((c) => walk(c, bbox, `${path}.${role}`)),
    };
    return el;
  };
  return walk(root, { x: 0, y: 0 }, idPrefix || 'root');
}
