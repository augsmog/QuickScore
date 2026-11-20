# AUG-1264 status (2026-11-20)

Re-verification of the launch gate on main f9426cf. No code change.

- `launch_ready_check.py` implements the frozen 12-row definition (SS-LAUNCH-READY-FROZEN-20261118); UNKNOWN counts as FAIL.
- Pytest: 27 passed (`test_launch_ready_check.py`, `test_launch_reporting.py`).
- Without receipts: 12 UNKNOWN rows, exit 1, `ready:false` (correct fail-closed behaviour).
- `.github/workflows/launch-ready.yml` runs on main push and daily 15:30 UTC, and has a seeded missing-command drill.
- Observed: recent main runs of "Launch readiness" show failure. This is expected while rows are UNKNOWN, but the checkout post-step also logs `fatal: No url found for submodule path 'august-industries-site' in .gitmodules` (exit 128 warning). Worth cleaning up separately; it did not change the gate result.
- Not done here (other tickets): posting results on AUG-496 and alarm routing (AUG-1268), real evidence receipts (AUG-1265/1266).
