# Composed Android integration — supersedes wrapper-blocker notes
Base (fresh remote read): 5190f43261a42f108d54627c793d5be64046c840, unchanged.
Composition: 39bb converter + 46c checkpoint + e737 exercised flow + four-hook
be873 sidecar; private original commits preserved. No contest-rounds wrapper ID.

The rounds observer now requires unique app-owned tournament Switch, exact
NUMBER OF ROUNDS heading and materialized rounds-2/3/4 controls with matching
labels. Every control is independently checked against setup/scroll/footer bounds;
no synthetic group rect is invented. Ordinary taps run 2→3→4, requiring the exact
selected count after each tap before another tap or selected-state capture. Missing
or conflicting selection stops; sequence control tests do not establish native PASS.

Read-only artifact14750629479 from run45010771493 attempt2 at5c81:
ZIP4118376 bytes SHA256 f5d052bd1b13d69a0344108686d445be6f5ce120170e63293ab2a84aeb4a1ca1.
No hierarchy files were archived. Both scale continuation reports observe one each
2/3/4, Switch checked true, but observedSelectedRoundCount=null. Exact main JSX
uses border/background/font colors/weight, not accessibilityState.selected.
Thus existing evidence does NOT prove selected count. The new sequence deliberately
fails if actual readback remains null. No pixel color inference or input-command
success substitutes for selection proof. No new accessibility behavior was added.

Source preflight now PASSES on composed actual source with Android constructor
mocked to assert zero device access. 31 portable capture/flow controls,5 sidecar
byte-invariance controls,81 deterministic tests pass on installed Node24/Python3.
Hosted Node22 and actual native execution remain unrun.

Remaining practical dependency: trustworthy observation of existing selected
visual state, or separately approved semantic accessibility-state exposure. The
wrapper is no longer a dependency. Exact trusted build/recipe/APK binding and
hierarchy→geometry receipt connection remain incomplete; scale/reviewer admission
are separate workers. Workflows, flags and required gate unchanged.
