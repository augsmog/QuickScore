#!/usr/bin/env python3
"""Run the rollback-only Day 14 SQL fixture and assert its actual CSV report rows."""
import csv
from decimal import Decimal, InvalidOperation
import io
import subprocess
import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 scripts/ci/test-day14-report.py <disposable-postgres-url>")
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        ["psql", "--csv", "-q", "-X", "-v", "ON_ERROR_STOP=1",
         "-f", "scripts/ci/test-day14-report.sql", sys.argv[1]],
        cwd=root, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        sys.stderr.write(result.stderr)
        sys.stdout.write(result.stdout)
        raise SystemExit(result.returncode)

    rows = list(csv.DictReader(io.StringIO(result.stdout)))

    def number(row, key):
        try:
            return Decimal(row[key])
        except (InvalidOperation, KeyError):
            return None

    def find(section: str, metric: str, predicate):
        matches = [row for row in rows if row["section"] == section
                   and row["metric"] == metric and predicate(row)]
        require(len(matches) == 1, f"expected one {section}/{metric} row, found {len(matches)}")
        return matches[0]

    find("activation", "first round finished",
         lambda r: number(r, "numerator") == 1 and number(r, "denominator") == 1 and number(r, "rate") == 1)
    find("retention", "D7 retained / mature",
         lambda r: number(r, "numerator") == 1 and number(r, "denominator") == 1 and number(r, "rate") == 1
         and "D7 mature=1; immature=0" in r["notes"])
    find("retention", "D7 retained / mature",
         lambda r: number(r, "numerator") == 0 and number(r, "denominator") == 0 and number(r, "rate") is None
         and "D7 mature=0; immature=1" in r["notes"])
    find("organizer roster", "players added / approved members joined",
         lambda r: r["period"] == "00000000-0000-0000-0000-000000005811"
         and number(r, "numerator") == 3 and number(r, "denominator") == 1
         and "invitations: not measured" in r["notes"])
    find("sharing", "confirmed share rate",
         lambda r: number(r, "numerator") == 1 and number(r, "denominator") == 1 and number(r, "rate") == 1)
    print("PASS: report output has activation 1/1, mature D7 1/1, immature D7 NULL, roster 3/1, confirmed share 1/1")


if __name__ == "__main__":
    main()
