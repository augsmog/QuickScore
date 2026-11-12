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
