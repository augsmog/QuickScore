// Deterministic positive/negative fixtures for the Gate 2 (settlement
// visibility) clip detector. Loads minimal static HTML in a real Chromium
// page (no app server, no network) so getBoundingClientRect/getClientRects
// reflect real layout, which jsdom cannot provide.
//
// Usage: node --test e2e/shared/settlement-clip-detection.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { detectClipping, oldDimensionOnlyHasClipping } from "./settlement-clip-detection.mjs";

async function withFixture(html, fn) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(html);
  try {
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const BASE_STYLE = `
  * { margin: 0; box-sizing: border-box; font: 16px sans-serif; }
`;

test("contained overflow:hidden body: text fully inside passes", async () => {
  await withFixture(
    `<style>${BASE_STYLE} body { overflow: hidden; width: 390px; height: 844px; }</style>
     <body><div data-testid="row">Augie $12.50</div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.equal(detail.violations.length, 0, JSON.stringify(detail));
      assert.ok(detail.fragmentCount > 0);
    },
  );
});

test("scroll/auto escape: a row scrolled out of a scrollable list is clipped but the old predicate never even looks at it", async () => {
  // The old predicate only treated overflowX/Y === "hidden" or "clip" as
  // clipping (`["hidden","clip"].includes(style.overflowX)`), so an
  // `overflow: auto` settlement-scroll container -- the real one, per
  // web-real-flow.mjs's `settlement-scroll` testid -- was never even
  // inspected, regardless of whether a row inside it was actually scrolled
  // out of view. This fixture scrolls row1 fully above the clip box, which
  // is a real, visible clip (confirmed geometrically), not a false positive.
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow-y: auto; width: 200px; height: 40px; }
       .row { height: 40px; }
     </style>
     <body>
       <div class="clip" data-testid="clipper">
         <div class="row" data-testid="row1">Augie $12.50</div>
         <div class="row" data-testid="row2">Sam -$12.50</div>
       </div>
     </body>`,
    async (page) => {
      await page.locator('[data-testid="clipper"]').evaluate((el) => { el.scrollTop = 40; });

      const oldSays = await page.locator('[data-testid="row1"]').evaluate(oldDimensionOnlyHasClipping);
      assert.equal(oldSays, false, "old predicate ignores overflow:auto ancestors entirely (the regression this fixture proves)");

      const scrolledOut = await page.locator('[data-testid="row1"]').evaluate(detectClipping, 1);
      assert.ok(scrolledOut.violations.length > 0, JSON.stringify(scrolledOut));
      assert.ok(scrolledOut.violations.some((v) => v.crossesY), JSON.stringify(scrolledOut));

      const scrolledIn = await page.locator('[data-testid="row2"]').evaluate(detectClipping, 1);
      assert.equal(scrolledIn.violations.length, 0, "row2 is the one actually scrolled into view and must not be flagged: " + JSON.stringify(scrolledIn));
    },
  );
});

test("vertical clip: text pushed below a clipper that clips only on the Y axis", async () => {
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow-y: hidden; overflow-x: visible; width: 200px; height: 20px; }
       .tall { height: 60px; padding-top: 40px; }
     </style>
     <body><div class="clip" data-testid="clipper"><div class="tall" data-testid="row">Lee -$4.00</div></div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(detail.violations.length > 0, JSON.stringify(detail));
      assert.ok(detail.violations.some((v) => v.crossesY), JSON.stringify(detail));
    },
  );
});

test("nested clipping: an inner-contained row still gets flagged against an outer clipper it crosses", async () => {
  await withFixture(
    `<style>${BASE_STYLE}
       .outer { overflow: hidden; width: 120px; height: 200px; }
       .inner { overflow: hidden; width: 300px; height: 40px; }
       .wide { width: 250px; white-space: nowrap; }
     </style>
     <body>
       <div class="outer" data-testid="outer">
         <div class="inner" data-testid="inner"><div class="wide" data-testid="row">Sam owes a lot of money today</div></div>
       </div>
     </body>`,
    async (page) => {
      // The inner clipper's own scrollWidth===clientWidth (the wide row fits
      // inside it, so it never overflows), which is exactly the "equal
      // dimensions" case acceptance criterion 1 calls out -- a dimension-only
      // check on each ancestor in isolation would see no overflow anywhere
      // and miss that the fragment still crosses the outer clipper's real
      // geometric bounds.
      const innerDims = await page.locator('[data-testid="inner"]').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      assert.equal(innerDims.scrollWidth, innerDims.clientWidth, "inner clipper must not overflow on its own terms");

      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      // The inner 300px clipper never crosses (text fits inside it), but the
      // outer 120px clipper does -- nested ancestor walking must catch it.
      assert.ok(detail.violations.some((v) => v.clipper.includes("outer")), JSON.stringify(detail));
      assert.ok(!detail.violations.some((v) => v.clipper.includes("inner")), JSON.stringify(detail));
    },
  );
});

test("sanity: an unclipped row with no ancestor overflow styling has zero violations", async () => {
  await withFixture(
    `<style>${BASE_STYLE}</style>
     <body><div data-testid="row">Augie $0.00</div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.equal(detail.violations.length, 0, JSON.stringify(detail));
    },
  );
});

test("horizontal clip: text pushed right of a clipper that clips only on the X axis", async () => {
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow-x: hidden; overflow-y: visible; width: 20px; height: 30px; }
       .wide { width: 60px; padding-left: 40px; white-space: nowrap; }
     </style>
     <body><div class="clip" data-testid="clipper"><div class="wide" data-testid="row">Lee -$4.00</div></div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(detail.violations.length > 0, JSON.stringify(detail));
      assert.ok(detail.violations.some((v) => v.crossesX), JSON.stringify(detail));
    },
  );
});

test("tolerance boundary: the same small overflow passes under a looser tolerance and fails under a tighter one", async () => {
  // Rather than depend on exact sub-pixel font metrics to construct a
  // literal 1.0px overflow, this drives the documented tolerancePx argument
  // itself across the measured overflow's boundary -- directly proving the
  // detector honors "a documented 1 CSS-pixel tolerance" rather than always
  // flagging any crossing.
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow: hidden; width: 100px; height: 30px; }
       .nudge { padding-left: 97px; white-space: nowrap; }
     </style>
     <body><div class="clip" data-testid="clipper"><div class="nudge" data-testid="row">A</div></div></body>`,
    async (page) => {
      const loose = await page.locator('[data-testid="row"]').evaluate(detectClipping, 50);
      assert.equal(loose.violations.length, 0, "a tolerance wider than the real overflow must not flag it: " + JSON.stringify(loose));

      const tight = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(tight.violations.some((v) => v.crossesX), "a tolerance narrower than the real overflow must flag it: " + JSON.stringify(tight));
    },
  );
});

test("overflow:clip ancestor is treated the same as overflow:hidden", async () => {
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow: clip; width: 80px; height: 20px; }
       .wide { width: 200px; white-space: nowrap; }
     </style>
     <body><div class="clip" data-testid="clipper"><div class="wide" data-testid="row">Lee owes everyone today</div></div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(detail.violations.some((v) => v.crossesX), JSON.stringify(detail));
    },
  );
});

test("multiple text fragments/lines: a wrapped two-line row is checked fragment-by-fragment, not just by its outer box", async () => {
  // The row's own bounding box can be fully contained while one wrapped
  // *line* (a distinct getClientRects() fragment) still crosses the clipper,
  // e.g. a long second line pushed past a width-constrained ancestor on a
  // narrow settlement card. Per-fragment checking must catch that even
  // though the single-line "sanity"/"contained" fixtures above would not.
  await withFixture(
    `<style>${BASE_STYLE}
       .clip { overflow: hidden; width: 120px; height: 60px; }
       .card { width: 120px; }
       .line2 { width: 60px; white-space: nowrap; }
     </style>
     <body>
       <div class="clip" data-testid="clipper">
         <div class="card">
           <div data-testid="row">
             <div>Augie owes</div>
             <div class="line2">a lot more than this narrow card can show</div>
           </div>
         </div>
       </div>
     </body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(detail.fragmentCount >= 2, JSON.stringify(detail));
      assert.ok(detail.violations.some((v) => v.crossesX), JSON.stringify(detail));
    },
  );
});

test("body/viewport clipping: a row positioned past the viewport edge with no styled overflow ancestor is still flagged", async () => {
  // No ancestor has overflow:hidden/clip/scroll/auto at all here -- the only
  // thing clipping this row is the viewport itself (and the implicit body
  // edge), proving the detector's unconditional viewport clipper entry
  // (not just ancestor-style-driven ones) does real work.
  await withFixture(
    `<style>${BASE_STYLE}</style>
     <body><div data-testid="row" style="position:absolute; left: 385px; top: 10px; white-space: nowrap;">Pat −$9.00 overflow</div></body>`,
    async (page) => {
      const detail = await page.locator('[data-testid="row"]').evaluate(detectClipping, 1);
      assert.ok(detail.violations.some((v) => v.clipper === "viewport" && v.crossesX), JSON.stringify(detail));
    },
  );
});
