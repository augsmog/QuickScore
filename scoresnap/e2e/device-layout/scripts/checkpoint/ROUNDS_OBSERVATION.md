# Source-specific rounds paint observation (supplemental)

Exact unchanged product uses primary #175C3A for selected border, primary+20
(alpha32/255) over #FAF4E8 for fill, and #E3D9C6 / #FAF4E8 for unselected.
The expected opaque selected fill is RGB(222,225,210). Source policy checks those
literal styles before navigation and each identity check. No product edits.

The observer runs INSIDE capture's before/after foreground, boot/APK/source and
identical-hierarchy transaction. It obtains unique app-owned 2/3/4 bounds from the
existing scene guard, requires all within scroll/setup/footer, then classifies the
same PNG. No OCR, tap-sequence inference, guessed positions or RGB tolerance.
Exact fill must occupy a strict majority of the entire bounded control, and all
four edge-normal quarter-depth rays must contain the correct border and no opposite
border. This conservative predicate rejects animations/overlays/unknown palette;
it is not a general visual-layout evaluator. Exactly one selected control must
match the requested count. Any reported native selection must agree. The state,
PNG hash and hierarchy hash enter the capture receipt; it remains supplemental.

Historical audit: artifact14750629479 / run45010771493 attempt2, ZIP SHA
f5d052bd1b13d69a0344108686d445be6f5ce120170e63293ab2a84aeb4a1ca1.
The exact a073 source/tree and same APK a4ebec7098334a31f32207f1ed0ffece21319d8f2c349215cbe45321c31e5cd9
are reported. Each receipt's PNG digest matches the bytes inspected:
1.0 ed0bcc32e5c435ae4f4f3349e662fefa5140b20d22b82829f4df2a3cbbb7afef
1.3 d25e8f1bd84e5e30e8b111f826c13920039015dea2e18c30cee32214d5039f06
Both visibly and algorithmically classify 2 from retained per-control bounds.
No raw hierarchy was archived; bounds are from continuation reports, not newly
verified hierarchy. Only selected2 was captured, so NO native3/4 transition proof
or current-main proof exists. Synthetic2/3/4 controls test code, not device proof.
No runtime RN scale inferred from these OS scales. No images are in source packet.

If actual captured colors/semantic states cannot be read reliably, stop. Separate
unapplied alternative: accessibilityState={{selected: numRounds === n}} on the
existing rounds AnimatedPressable. That honestly exposes existing state but can
change screen-reader announcements; review/test forwarding and native accessibility
before adopting. No speech semantics or product code changed here.

# Build and GitHub provenance connection still required

Record the actual event repository/run_id/attempt/job/ref/GITHUB_SHA; read PR number,
head.sha, base.sha and merge_commit_sha independently from event/API. For a
pull_request run, default GITHUB_SHA is the merge-branch commit, NOT head.sha
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).
Pin/read actual checkout HEAD, full HEAD^{tree}, parents and tracked clean status;
compare with explicitly selected event commit. Never rewrite receipt SHA to head
because the checkout tree happens to match it. Same tree proves content equivalence
only, not identical commit object, build environment or APK bytes.

Use exact anonymous public HTTPS fetch/export without recursive submodules for
this known source; no credential configuration. Inventory gitlinks explicitly and
keep them inert if outside declared build inputs; fail if a required build input
is an unresolved gitlink. Do not treat orphan-submodule warnings as source proof
or modify checkout trust/security to mask them. Current workflow is unchanged.

Trusted builder must emit actual source commit/tree plus lockfiles/recipe/generated
native config/toolchain/profile digests, build variant, APK SHA256 and byte count.
Re-read sources after build, hash actual APK, verify installed APK bytes, record
application/component and capture hashes under same run/attempt. Bind declared QA
runtime configuration separately from product source. Never reuse old binary or
screenshot receipt for a same-tree synthetic ref. Current capture's four-field
binding is only identity checking, NOT a complete builder attestation; this document
does not claim that integration is implemented or the required gate is restored.
