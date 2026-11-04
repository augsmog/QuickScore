export function findInteractiveTargetOverlaps(targets, tolerance = 2) {
  const overlaps = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      // A nested control intentionally handles its own tap; it is not an
      // ambiguous sibling hit target (for example, a billing period toggle
      // inside a selectable plan row).
      if ((a.parentId != null && a.parentId === b.id) || (b.parentId != null && b.parentId === a.id)) continue;
      const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (width > tolerance && height > tolerance) {
        overlaps.push({first: a.name, second: b.name, width, height});
      }
    }
  }
  return overlaps;
}
