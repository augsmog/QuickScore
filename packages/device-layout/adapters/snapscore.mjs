// SnapScore adapter: turns the existing browser capture audit output
// (auditCapture() in scoresnap/e2e/journeys/capture-layout.mjs) and its device
// profile ({width,height,top,bottom}) into device-layout/v1 inputs. The browser
// measurement code stays where it is; only the rule evaluation is shared.
import {SNAPSHOT_SCHEMA} from '../src/rules.mjs';

export function profileToDevice(id, profile, {platform = 'ios'} = {}) {
  return {
    id,
    platform,
    orientation: profile.width > profile.height ? 'landscape' : 'portrait',
    width: profile.width,
    height: profile.height,
    safeArea: {top: profile.top ?? 0, right: profile.right ?? 0, bottom: profile.bottom ?? 0, left: profile.left ?? 0},
  };
}

const rect = r => ({left: r.left, top: r.top, right: r.right, bottom: r.bottom});

export function fromCaptureAudit(layout, {device, screen, screenshot = null, provenance = undefined}) {
  return {
    schema: SNAPSHOT_SCHEMA,
    device,
    screen,
    screenshot,
    source: 'snapscore/capture-layout',
    ...(provenance ? {provenance} : {}),
    targets: layout.targets.map(t => ({
      id: t.id, name: t.name, ...rect(t),
      ...(t.size ? {size: {width: t.size.width, height: t.size.height}} : {}),
      ...(t.parentId != null ? {parentId: t.parentId} : {}),
      backdrop: Boolean(t.backdrop),
      unsupported: Boolean(t.unsupported),
    })),
    texts: layout.texts.map(x => ({name: x.name, ...rect(x), owners: x.owners ?? [], unsupported: Boolean(x.unsupported)})),
  };
}
