# Settings row clipping investigation (Refs AUG-1177)

Production settings code is unchanged from main 31ae28b1c4c81f9c07fdb914497b8761e5f8311d.
The original 390x844 measurement in PR281 did not exercise the reported profiles
or distinguish raw size from painted scroll fragments. The registered browser
regression now seeds offline state, navigates Home -> Profile -> Settings, resets
the actual scrolling ancestor independently for each named row, then reveals it.
All five pointer hit points and full geometry must clear the scroll and safe bounds.
A real DOM mutation reducing Distance Unit to 20px must fail the same assertion.

| Profile | Initial Unit Amount y/height | Initial Distance Unit y/height | Revealed heights |
| --- | --- | --- | --- |
| SE 375x667 top20/bottom0 | 624 / 67 | 826 / 48 | 67 / 48 |
| 15Pro 393x852 top59/bottom34 | 663 / 67 | 865 / 48 | 67 / 48 |
| ProMax 430x932 top59/bottom34 | 663 / 67 | 865 / 48 | 67 / 48 |

SE's initial Unit Amount painted fragment is exactly 667-624=43px.
ProMax's initial Distance Unit fragment inside the bottom-safe scroll viewport is
898-865=33px. These reproduce the reported fragments without any undersized row.
Both controls fully reveal within safe bounds and accept pointer hits after real
scroll movement. Increasing minHeight cannot prevent arbitrary viewport-edge
fragments in a scrolling list; no product layout change is proposed here.

The PR266 capture audit's size rect starts by clipping to the viewport, before its
scrollable-ancestor sizing reconciliation. The SE 43px fragment can therefore
still fail that strict audit. This candidate does not modify that audit, exempt
IDs, claim first-paint full visibility, or establish a strict capture PASS.
AUG-1212 tracks the same remaining SE investigation; AUG-1211 is an independent
modal/scrim finding. Reconcile those gates before AUG-1155 or its parent closes.

Evidence: /workspace/aos-work/lanes/pull-ss/evidence/20261117-1177/
(`head-browser/settings-rows/<profile>/`: initial/revealed PNGs and geometry.json).
Run the registered browser file against the exact offline web export:

    BASE_URL=http://127.0.0.1:8092 node --test e2e/journeys/value-dom-regressions.browser.test.mjs
    node --test e2e/settings-row-min-height.test.mjs e2e/journeys/ci-registration.test.mjs

The standalone browser file is imported by the already CI-registered
value-dom-regressions browser file. No workflow or customer text changed.
