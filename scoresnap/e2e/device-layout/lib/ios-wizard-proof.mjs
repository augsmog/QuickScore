// Capture integrity only. This adds preconditions; it never waives geometry findings.
import {finiteRect} from './geometry-rules.mjs';

const names = ['name entry', 'four players', 'last player above footer', 'rewind remove ava', 'four players add group'];
const indexedPlayerControl = /^(?:wizard-player-(?:handicap|group)-[2-4]|wizard-player-team-[2-4]-[A-Z]|wizard-remove-player-[2-4])$/;
function requireProof(ok, reason) {
  if (!ok) throw new Error('iOS wizard capture: ' + reason);
}
function one(cp, id) {
  const hits = cp.nodes.filter(n => n.id === id);
  requireProof(hits.length === 1, `${cp.checkpoint}: expected one ${id}, got ${hits.length}`);
  return hits[0];
}
function painted(cp, node) {
  const {bbox:r, meta, enabled} = node;
  const s = meta?.scrollViewport, c = cp.context, a = c?.safeArea, v = c?.viewport, f = c?.footer;
  requireProof(enabled === true && [r,s,f].every(finiteRect) && a && v &&
    [v.width,v.height,a.left,a.top,a.right,a.bottom].every(n => Number.isFinite(n) && n >= 0) &&
    f.top > 0 && f.top < v.height &&
    r.right-r.left >= 44 && r.bottom-r.top >= 44 &&
    r.left >= Math.max(s.left,a.left) && r.right <= Math.min(s.right,v.width-a.right) &&
    r.top >= Math.max(s.top,a.top) && r.bottom <= Math.min(s.bottom,v.height-a.bottom,f.top),
  `${cp.checkpoint}: ${node.id} not fully painted at >=44pt inside scroll, safe area and footer`);
}
function roster(cp) {
  for (const prefix of ['wizard-player-row-', 'wizard-player-name-']) {
    requireProof(cp.nodes.filter(n => n.id?.startsWith(prefix)).length === 4, cp.checkpoint + ': not four players');
    for (const i of [1,2,3,4]) one(cp, prefix+i);
  }
  requireProof(one(cp,'wizard-player-name-1').text === 'Ava', cp.checkpoint + ': wrong player one');
  // Match player slot ordering, entered names, handicap, group and team-control states; excludes scroll geometry.
  const indexed = cp.nodes.filter(n => indexedPlayerControl.test(n.id));
  requireProof(new Set(indexed.map(n => n.id)).size === indexed.length,
    cp.checkpoint + ': duplicate indexed player control');
  return JSON.stringify(cp.nodes.filter(n => indexedPlayerControl.test(n.id) ||
    /^(wizard-player-name-|player-(?:handicap|group|team)-|remove-player-)/.test(n.id))
    .map(n => [n.id,n.text,n.enabled,n.selected,n.checked]));
}
export function verifyIOSWizard(bundle, {sourceSha,profileId,buildHash}) {
  requireProof(bundle.platform === 'ios' && bundle.profile === profileId &&
    /^[a-f0-9]{40}$/.test(sourceSha) && bundle.sourceSha === sourceSha &&
    /^[a-f0-9]{64}$/.test(buildHash) && bundle.buildHash === buildHash, 'candidate, build or device mismatch');
  const seq = bundle.checkpoints.filter(c => c.flow === 'new-contest' && names.includes(c.checkpoint));
  requireProof(JSON.stringify(seq.map(c=>c.checkpoint)) === JSON.stringify(names), 'missing, duplicated or out-of-order wizard stops');
  for (const cp of seq) {
    const slug = cp.checkpoint.replaceAll(' ','-');
    requireProof(cp.screen === 'new-contest' && cp.platform === 'ios' && cp.deviceId === profileId &&
      new RegExp('^\\d+-new-contest-'+slug+'\\.png$').test(cp.screenshot) && /^[a-f0-9]{64}$/.test(cp.screenshotSha256),
      cp.checkpoint + ': wrong device, missing or unbound screenshot');
  }
  const [entry,initial,tail,rewind,group] = seq;
  const name = one(entry,'wizard-player-name-1');
  const kb = entry.context?.measuredKeyboardInset;
  requireProof(name.text === 'Ava' && Number.isFinite(kb) && kb > 0 &&
    entry.context.safeArea?.bottom >= kb && kb < entry.context.viewport?.height, 'typed Ava with measured keyboard required');
  painted(entry,name);
  const state = roster(initial);
  for (const cp of [tail,rewind,group]) requireProof(roster(cp) === state, cp.checkpoint + ': four-player state changed');
  painted(initial,one(initial,'remove-player-Ava'));
  painted(tail,one(tail,'wizard-player-row-4'));
  painted(rewind,one(rewind,'remove-player-Ava'));
  painted(group,one(group,'add-group'));
  // Compare movement relative to the actual scroll viewport, not the fixed footer/absolute screen.
  const offset = cp => {
    const n = one(cp,'wizard-player-row-4');
    requireProof(finiteRect(n.bbox) && finiteRect(n.meta?.scrollViewport), cp.checkpoint + ': missing row/viewport');
    return n.bbox.top - n.meta.scrollViewport.top;
  };
  requireProof(offset(initial)-offset(tail) >= 1 && offset(rewind)-offset(tail) >= 1 &&
    tail.screenshotSha256 !== initial.screenshotSha256 && tail.screenshotSha256 !== rewind.screenshotSha256,
    'fourth row did not move to tail and back with distinct captured pixels');
}
