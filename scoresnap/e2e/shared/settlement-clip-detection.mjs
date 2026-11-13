// Runs inside the browser via page.evaluate/locator.evaluate. Must have no
// closure over Node-side variables (only `element` and `tolerancePx` args),
// since Playwright serializes this function by source and re-executes it
// in the page context.
export function detectClipping(element, tolerancePx) {
  const CLIPPING_OVERFLOW = new Set(["hidden", "clip", "scroll", "auto"]);
  const rowRect = element.getBoundingClientRect();

  // The viewport itself always clips, even with no clipping ancestor styled.
  const clippers = [{ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, axis: "viewport" }];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipsX = CLIPPING_OVERFLOW.has(style.overflowX);
    const clipsY = CLIPPING_OVERFLOW.has(style.overflowY);
    if (clipsX || clipsY) {
      const rect = node.getBoundingClientRect();
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;
      clippers.push({
        left: clipsX ? rect.left + borderLeft : -Infinity,
        right: clipsX ? rect.right - borderRight : Infinity,
        top: clipsY ? rect.top + borderTop : -Infinity,
        bottom: clipsY ? rect.bottom - borderBottom : Infinity,
        axis: `${node.tagName.toLowerCase()}${node.getAttribute("data-testid") ? `[${node.getAttribute("data-testid")}]` : ""}`,
      });
    }
    if (node === document.body) break;
  }

  const fragments = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.width === 0 && rect.height === 0) continue;
      fragments.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
  }

  // Geometric containment against each clipper's actual clip rectangle,
  // scroll position included, instead of a scrollWidth/clientWidth dimension
  // check. The dimension check this replaces also only treated
  // overflow:hidden/clip as clipping, so a scrollable settlement-scroll list
  // (overflow:auto/scroll) was never inspected at all -- a row scrolled
  // above the visible area went unflagged regardless of its real position.
  const violations = [];
  for (const fragment of fragments) {
    for (const clipper of clippers) {
      const crossesX = fragment.left < clipper.left - tolerancePx || fragment.right > clipper.right + tolerancePx;
      const crossesY = fragment.top < clipper.top - tolerancePx || fragment.bottom > clipper.bottom + tolerancePx;
      if (crossesX || crossesY) violations.push({ fragment, clipper: clipper.axis, crossesX, crossesY });
    }
  }

  return {
    testId: element.getAttribute("data-testid"),
    row: { left: rowRect.left, right: rowRect.right, top: rowRect.top, bottom: rowRect.bottom },
    fragmentCount: fragments.length,
    violations,
  };
}

// The predicate this replaces (kept only so the regression fixtures can show
// it misses the case above). Not used by the real flow anymore.
export function oldDimensionOnlyHasClipping(element) {
  for (let node = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipsX = ["hidden", "clip"].includes(style.overflowX);
    const clipsY = ["hidden", "clip"].includes(style.overflowY);
    if ((clipsX && node.scrollWidth > node.clientWidth + 1) || (clipsY && node.scrollHeight > node.clientHeight + 1)) {
      return true;
    }
  }
  return false;
}
