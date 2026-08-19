#!/usr/bin/env python3
"""Avenize Design Constitution — CI drift gate (Phase A6).

Enforces the constitution's critical rule: every screen uses the design
system; no one-off styling. Two measurable rules:

  R1  Hardcoded hex colors (#abc / #a1b2c3 / #a1b2c3d4) in app UI files.
      Colors must resolve through the --av-* tokens (avenize-brand.css).
  R2  Anti-slop utility classes: purple gradient washes + bounce animation
      (constitution A2 #3, #6).

Historical drift is recorded in design_constitution_baseline.json. The gate
FAILS when:
  * a file's violation count exceeds its baseline, or
  * a NEW file (not in the baseline) introduces violations.
The baseline only burns down. Regenerate intentionally with --write-baseline
after a deliberate, reviewed visual decision.

Usage:
  python3 scripts/check_design_constitution.py                  # check
  python3 scripts/check_design_constitution.py --write-baseline # re-baseline
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE = Path(__file__).with_name("design_constitution_baseline.json")
SCAN_DIRS = ["src/pages", "src/components", "src/lib", "src/hooks"]
FILE_RE = re.compile(r"\.(tsx|jsx)$")

HEX_RE = re.compile(r"#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|#[0-9a-fA-F]{3}\b")
SLOP_RES = [
    re.compile(r"\b(?:from|via|to)-purple-\d{3}\b"),
    re.compile(r"\b(?:bg|text|border|ring)-purple-[0-9]{3}\b"),
    re.compile(r"\banimate-bounce\b"),
]
# String literals that are legitimately hex-keyed lookup maps are still drift;
# the baseline records today's debt so the gate only blocks GROWTH.


def scan_file(path: Path):
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    hex_count = len(HEX_RE.findall(text))
    slop_count = sum(len(r.findall(text)) for r in SLOP_RES)
    if hex_count == 0 and slop_count == 0:
        return None
    return {"hex": hex_count, "slop": slop_count}


def scan():
    results = {}
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not FILE_RE.search(path.name):
                continue
            rel = str(path.relative_to(ROOT))
            counts = scan_file(path)
            if counts:
                results[rel] = counts
    return results


def main():
    write = "--write-baseline" in sys.argv
    current = scan()
    if write:
        BASELINE.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n")
        print(f"baseline written: {len(current)} files with violations")
        return 0

    if not BASELINE.exists():
        print("ERROR: design_constitution_baseline.json missing.")
        print("Run: python3 scripts/check_design_constitution.py --write-baseline")
        return 1

    baseline = json.loads(BASELINE.read_text())
    failures = []
    improved = 0
    for rel, counts in current.items():
        base = baseline.get(rel)
        if base is None:
            failures.append(
                f"NEW VIOLATIONS in {rel}: hex={counts['hex']} slop={counts['slop']} "
                "(use --av-* tokens / constitution A1-A2)"
            )
            continue
        if counts["hex"] > base["hex"] or counts["slop"] > base["slop"]:
            failures.append(
                f"DRIFT GROWTH in {rel}: hex {base['hex']}->{counts['hex']}, "
                f"slop {base['slop']}->{counts['slop']}"
            )
        elif counts["hex"] < base["hex"] or counts["slop"] < base["slop"]:
            improved += 1

    total_hex = sum(c["hex"] for c in current.values())
    total_slop = sum(c["slop"] for c in current.values())
    base_hex = sum(c["hex"] for c in baseline.values())
    base_slop = sum(c["slop"] for c in baseline.values())

    print("=== Avenize Design Constitution gate ===")
    print(f"files with violations: {len(current)} (baseline {len(baseline)})")
    print(f"hex: {total_hex} (baseline {base_hex})  slop: {total_slop} (baseline {base_slop})")
    if improved:
        print(f"files improved since baseline: {improved} — thank you")

    if failures:
        print("\nCONSTITUTION VIOLATIONS:")
        for f in failures:
            print(f"  ✗ {f}")
        print("\nFix by routing colors through --av-* tokens (avenize-brand.css)")
        print("and removing anti-slop classes (constitution A2).")
        return 1

    print("PASS: no design drift growth. Baseline only burns down.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
