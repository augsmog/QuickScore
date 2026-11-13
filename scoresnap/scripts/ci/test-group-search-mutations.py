#!/usr/bin/env python3
"""Prove group/search tests reject broken behaviors in disposable engine copies.

Usage: python3 scripts/ci/test-group-search-mutations.py
Never changes the working tree or shared dependencies; no downloads.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TEST = "src/engine/__tests__/leaderboard-rows.test.ts"
ROWS = "src/engine/leaderboard-rows.ts"
VIEW = "src/engine/calculators/leaderboard-view.ts"
MUTATIONS = {
    "group-filter-removed": (ROWS,
        "filtered = filtered.filter((row) => row.groupId === groupId);",
        "filtered = filtered;"),
    "full-field-restore-broken": (ROWS,
        "if (groupId != null) {\n    filtered = filtered.filter((row) => row.groupId === groupId);\n  }",
        'filtered = filtered.filter((row) => row.groupId === (groupId ?? "north"));'),
    "net-replaced-by-gross": (VIEW,
        'if (mode === "net") {', 'if (false) {'),
    "filtered-ranks-reset": (ROWS,
        "return filtered;",
        "return filtered.map((row, index) => ({ ...row, rank: index + 1, rankLabel: String(index + 1) }));"),
}


def run():
    jest = ROOT / "node_modules/jest/bin/jest.js"
    if not jest.is_file():
        raise SystemExit("Missing shared Jest dependency tree")
    with tempfile.TemporaryDirectory(prefix="group-search-mutations-") as tmp:
        target = Path(tmp)
        shutil.copytree(ROOT / "src/engine", target / "src/engine")
        for name in ("package.json", "babel.config.js", "jest.config.cjs"):
            shutil.copy2(ROOT / name, target / name)
        (target / "node_modules").symlink_to((ROOT / "node_modules").resolve(), target_is_directory=True)
        originals = {path: (target / path).read_text() for path in (ROWS, VIEW)}
        for name, mutation in [("baseline", None), *MUTATIONS.items()]:
            for path, content in originals.items():
                (target / path).write_text(content)
            if mutation:
                path, old, new = mutation
                content = originals[path]
                if content.count(old) != 1:
                    raise SystemExit(f"{name}: mutation anchor must match exactly once")
                (target / path).write_text(content.replace(old, new))
            result = subprocess.run(
                ["node", str(jest), "--runInBand", "--no-cache", "--runTestsByPath", TEST,
                 "--testNamePattern", "group/search mode regression", "--json"],
                cwd=target, env={**os.environ, "CI": "1"}, capture_output=True, text=True,
                timeout=60,
            )
            try:
                report = json.loads(result.stdout)
            except ValueError:
                raise SystemExit(f"{name}: no valid Jest report\n{result.stderr}")
            assertions = [a for suite in report["testResults"] for a in suite["assertionResults"]
                          if "group/search mode regression" in a["fullName"]]
            failed = [a for a in assertions if a["status"] == "failed"]
            passed = [a for a in assertions if a["status"] == "passed"]
            if len(assertions) != 4 or report.get("numRuntimeErrorTestSuites", 0):
                raise SystemExit(f"{name}: expected four runnable regressions\n{result.stderr}")
            if not mutation:
                if result.returncode or len(passed) != 4:
                    raise SystemExit(f"baseline: expected four PASS\n{result.stderr}")
                print("baseline: 4/4 PASS")
            else:
                # Import/runtime errors do not count as mutation sensitivity.
                if result.returncode != 1 or not failed or not all(
                    "expect(" in "\n".join(a.get("failureMessages", [])) for a in failed
                ):
                    raise SystemExit(f"{name}: expected assertion failures\n{result.stderr}")
                print(f"{name}: DETECTED ({len(failed)} assertion failures)")
                for assertion in failed:
                    print(f"  {assertion['fullName']}")


if __name__ == "__main__":
    run()
