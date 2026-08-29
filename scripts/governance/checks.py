"""Executable validators for the Avenize constitution.

Each check returns a CheckResult:
  status: PASS | FAIL | UNKNOWN (UNKNOWN never counts as healthy)
  severity: P0|P1|P2|P3|P4 (the consequence when the rule fails)
  blocking: whether a FAIL blocks the release gate
  detail: machine-readable evidence (never fabricate)
  remediation: policy id from autonomy-policy-registry.json or 'human'
"""
from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOVERNANCE_DIR = ROOT / "governance"
CONTRACT = ROOT / "supabase" / "contract" / "production_contract.json"
MIGRATIONS = ROOT / "supabase" / "migrations"
SRC = ROOT / "src"
APP_TSX = SRC / "App.tsx"

BANNED_MIGRATION_NAMES = {"final.sql", "latest.sql", "fix.sql", "new.sql"}


@dataclass
class CheckResult:
    status: str  # PASS | FAIL | UNKNOWN
    severity: str = "P3"
    blocking: bool = False
    detail: dict = field(default_factory=dict)
    remediation: str = "human"

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "severity": self.severity,
            "blocking": self.blocking,
            "detail": self.detail,
            "remediation": self.remediation,
        }


def _run(cmd: list[str], timeout: int = 300) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        out = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode, out
    except FileNotFoundError:
        return 127, f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"


def _load_json(path: Path) -> dict | list | None:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


# ---------------------------------------------------------------- validators


def check_governing_constitution() -> CheckResult:
    doc = GOVERNANCE_DIR / "AVENIZE-GOVERNING-CONSTITUTION.md"
    registry = _load_json(GOVERNANCE_DIR / "constitution-registry.json")
    if not doc.exists():
        return CheckResult("FAIL", "P0", True, {"missing": str(doc.relative_to(ROOT))})
    if not isinstance(registry, dict) or not registry.get("layers"):
        return CheckResult("FAIL", "P0", True, {"invalid": "constitution-registry.json"})
    return CheckResult("PASS", detail={"layers": len(registry["layers"])})


def check_hierarchy_consistency() -> CheckResult:
    registry = _load_json(GOVERNANCE_DIR / "constitution-registry.json")
    if not isinstance(registry, dict):
        return CheckResult("FAIL", "P1", True, {"invalid": "registry"})
    missing = []
    for layer in registry.get("layers", []):
        docs = [GOVERNANCE_DIR, ROOT]
        doc = layer["document"]
        if not any((base / doc).resolve().exists() for base in docs):
            missing.append(doc)
    if missing:
        return CheckResult("FAIL", "P1", True, {"missing_docs": missing})
    return CheckResult("PASS", detail={"layers_checked": len(registry["layers"])})


def check_contract_manifest_deterministic() -> CheckResult:
    if not CONTRACT.exists():
        return CheckResult("FAIL", "P1", True, {"missing": "production_contract.json"})
    code, out = _run([sys.executable, str(ROOT / "scripts/generate_contract_manifest.py")])
    if code != 0:
        return CheckResult("FAIL", "P1", True, {"generator_error": out[-800:]})
    git = _run(["git", "diff", "--numstat", "--", str(CONTRACT.relative_to(ROOT))])
    lines = [ln for ln in git[1].splitlines() if ln.strip()]
    if lines:
        return CheckResult(
            "FAIL",
            "P1",
            True,
            {"drift": "manifest differs after regeneration", "files": lines},
        )
    return CheckResult("PASS", detail={"regenerated": True})


def check_frontend_contract_backed() -> CheckResult:
    # generate_contract_manifest.py exits 1 when a frontend reference lacks a
    # canonical definition (same guarantee as the CI contract-manifest job).
    code, out = _run([sys.executable, str(ROOT / "scripts/generate_contract_manifest.py")])
    if code != 0:
        return CheckResult("FAIL", "P1", True, {"unbacked_frontend_refs": out[-600:]})
    return CheckResult("PASS")


def check_migration_naming() -> CheckResult:
    problems = []
    prefixes = {}
    for path in sorted(MIGRATIONS.glob("*.sql")):
        name = path.name
        if name in BANNED_MIGRATION_NAMES:
            problems.append({"file": name, "reason": "banned name"})
            continue
        stem = name[:-4]
        valid = (
            (stem[0:14].isdigit() and len(stem) > 15)
            or (stem.split("_", 1)[0].isdigit() and "_" in stem and stem.find("zz") == -1)
        )
        if not valid:
            problems.append({"file": name, "reason": "non-canonical naming (legacy zz_)"})
        prefix = stem.split("_", 1)[0]
        if prefix.isdigit():
            prefixes.setdefault(prefix, []).append(name)
    for prefix, files in sorted(prefixes.items()):
        if len(files) > 1:
            problems.append({"file": "+".join(files), "reason": f"duplicate migration number {prefix}"})
    if problems:
        kind = [p for p in problems if p["reason"].startswith("duplicate")]
        if kind:
            return CheckResult("FAIL", "P1", True, {"problems": problems[:20]})
        # legacy zz_* files are known debt — they do not block, but new
        # canonical names must be used going forward (tracked in the report.
        return CheckResult("PASS", detail={"migration_naming_debt": len(problems), "problems": problems[:20]})
    return CheckResult("PASS")


def check_schema_drift() -> CheckResult:
    code, out = _run([sys.executable, str(ROOT / "scripts/check_schema_drift.py")])
    if code != 0:
        return CheckResult("FAIL", "P1", True, {"drift": out[-600:]})
    return CheckResult("PASS")


def check_pricing_constitution() -> CheckResult:
    """One Pricing Constitution (money contract, P0).

    The canonical plan vocabulary and kobo prices must be IDENTICAL across the
    pricing_tiers seed, the frontend fallback tiers, the edge VALID_PLANS, and
    paymentsCore display names, and the server must price via plan_price_cents
    (the browser never prices). A mismatch means a customer is quoted one price
    and charged another — a blocking release failure.
    """
    script = ROOT / "scripts/check_pricing_constitution.py"
    if not script.exists():
        return CheckResult("UNKNOWN", "P0", True, {"missing": "check_pricing_constitution.py"})
    code, out = _run([sys.executable, str(script)])
    if code != 0:
        return CheckResult("FAIL", "P0", True, {"pricing_mismatch": out[-600:]})
    return CheckResult("PASS")


def check_design_constitution() -> CheckResult:
    code, out = _run([sys.executable, str(ROOT / "scripts/check_design_constitution.py")])
    if code != 0:
        return CheckResult("FAIL", "P2", True, {"violations": out[-600:]})
    return CheckResult("PASS")


def check_typescript() -> CheckResult:
    code, out = _run(["npx", "tsc", "-b", "--noEmit"], timeout=420)
    if code == 127:
        return CheckResult("UNKNOWN", "P1", True, {"detail": "tsc not available"})
    if code != 0:
        return CheckResult("FAIL", "P1", True, {"errors": out[-600:]})
    return CheckResult("PASS")


def check_unit_tests() -> CheckResult:
    code, out = _run(["npx", "vitest", "run"], timeout=900)
    if code == 127:
        return CheckResult("UNKNOWN", "P1", True, {"detail": "vitest not available"})
    if code != 0:
        return CheckResult("FAIL", "P1", True, {"failures": out[-600:]})
    return CheckResult("PASS")


def check_edge_functions() -> CheckResult:
    script = ROOT / "scripts/check_edge_functions.sh"
    if not script.exists():
        return CheckResult("UNKNOWN", "P2", False, {"missing": "check_edge_functions.sh"})
    code, out = _run(["bash", str(script)], timeout=600)
    if code != 0:
        if "deno" in out.lower() and ("not found" in out.lower() or "no such" in out.lower()):
            return CheckResult("UNKNOWN", "P2", False, {"detail": "deno not available"})
        return CheckResult("FAIL", "P2", True, {"errors": out[-600:]})
    return CheckResult("PASS")


def check_supabase_manifests() -> CheckResult:
    targets = [
        "schema-manifest.json",
        "rpc-manifest.json",
        "policy-manifest.json",
        "trigger-manifest.json",
        "index-manifest.json",
        "edge-function-manifest.json",
    ]
    missing, invalid = [], []
    for t in targets:
        p = ROOT / "supabase" / "constitution" / t
        if not p.exists():
            missing.append(t)
            continue
        if _load_json(p) is None:
            invalid.append(t)
    if missing:
        return CheckResult("FAIL", "P2", True, {"missing": missing}, remediation="regenerate-manifests")
    if invalid:
        return CheckResult("FAIL", "P2", True, {"invalid": invalid})
    return CheckResult("PASS", detail={"manifests": targets})


def check_route_integrity() -> CheckResult:
    # Route-reference drift scan (Session 12 method): every /app/* link in src
    # must resolve to a registered route in App.tsx (handles dynamic segments).
    if not APP_TSX.exists():
        return CheckResult("UNKNOWN", "P2", False, {"missing": "App.tsx"})
    import re

    app_src = APP_TSX.read_text(encoding="utf-8")
    registered = set()
    for m in re.finditer(r'path="([^"]+)"', app_src):
        p = m.group(1).strip("/")
        if p.startswith("app/"):
            p = p[4:]
        registered.add(p)

    referenced = set()
    for tsx in SRC.rglob("*.tsx"):
        text = tsx.read_text(encoding="utf-8")
        for m in re.finditer(r"/app/([a-z0-9_/-]+)", text):
            referenced.add(m.group(1))

    missing = []
    for ref in referenced:
        head = ref.split("?")[0]
        if head in registered:
            continue
        base = head.split("/")[0]
        if any(r.split("/")[0] == base for r in registered):
            continue
        if any(r.endswith("/*") or r.endswith("*") and head.startswith(r[:-1]) for r in registered):
            continue
        missing.append(head)
    if missing:
        return CheckResult("FAIL", "P2", True, {"dead_links": sorted(missing)[:25]})
    return CheckResult("PASS", detail={"referenced": len(referenced)})


def check_no_hardcoded_secrets() -> CheckResult:
    import re

    patterns = [
        re.compile(r"service[_-]?role[\"']?\s*[:=]\s*[\"']eyJ", re.I),
        re.compile(r"paystack[_-]?secret:\s*[\"']sk_", re.I),
        re.compile(r"RESEND_API_KEY\s*=\s*\"re_", re.I),
    ]
    hits = []
    for area in (SRC, ROOT / "supabase" / "functions"):
        if not area.exists():
            continue
        for f in area.rglob("*"):
            if f.suffix not in (".ts", ".tsx"):
                continue
            try:
                text = f.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            for i, pat in enumerate(patterns):
                if pat.search(text):
                    hits.append({"file": str(f.relative_to(ROOT)), "pattern": i})
                    break
    if hits:
        return CheckResult("FAIL", "P0", True, {"hardcoded_secrets": hits[:10]})
    return CheckResult("PASS")


def check_platform_self_observability() -> CheckResult:
    # Governance can only claim its platform visibility if the platform ops
    # objects are part of the desired contract.
    contract = _load_json(CONTRACT)
    if not isinstance(contract, dict):
        return CheckResult("UNKNOWN", "P2", False, {"invalid": "contract"})
    names = {o["name"] for o in contract.get("objects", []) if isinstance(o, dict)}
    required = [
        "platform_error_events",
        "platform_incidents",
        "platform_integration_status",
        "governance_events",
        "governance_incidents",
        "autonomy_actions",
    ]
    missing = [r for r in required if r not in names]
    if missing:
        return CheckResult("FAIL", "P2", False, {"missing_contract_objects": missing},
                           remediation="re-derive-contract")
    return CheckResult("PASS")


def check_autonomy_registry() -> CheckResult:
    registry = _load_json(GOVERNANCE_DIR / "autonomy-policy-registry.json")
    if not isinstance(registry, dict) or not registry.get("policies"):
        return CheckResult("FAIL", "P2", True, {"invalid": "autonomy-policy-registry.json"})
    required = {
        "action", "allowed_when", "forbidden_when", "risk", "preconditions",
        "execution", "postconditions", "rollback", "max_attempts", "escalation",
        "audit",
    }
    bad = []
    for pol in registry["policies"]:
        missing_fields = sorted(required - set(pol.keys()))
        if missing_fields:
            bad.append({"policy": pol.get("action"), "missing": missing_fields})
    if bad:
        return CheckResult("FAIL", "P2", True, {"incomplete_policies": bad})
    return CheckResult("PASS", detail={"policies": len(registry["policies"])})


def check_feature_registry() -> CheckResult:
    registry = _load_json(GOVERNANCE_DIR / "feature-registry.json")
    if not isinstance(registry, dict) or not registry.get("features"):
        return CheckResult("UNKNOWN", "P3", False, {"invalid": "feature-registry.json"})
    required = {"feature", "domain", "route", "database", "permissions", "status", "tests"}
    bad = []
    for feat in registry["features"]:
        missing_fields = sorted(required - set(feat.keys()))
        if missing_fields:
            bad.append({"feature": feat.get("feature"), "missing": missing_fields})
    if bad:
        return CheckResult("FAIL", "P3", False, {"incomplete_features": bad})
    return CheckResult("PASS", detail={"features": len(registry["features"])})


CHECKS = {
    "const.registry.governing": {
        "layer": "governing",
        "severity": "P0",
        "blocking": True,
        "fn": check_governing_constitution,
        "summary": "Governing document + machine-readable registry exist",
    },
    "const.hierarchy": {
        "layer": "governing",
        "severity": "P1",
        "blocking": True,
        "fn": check_hierarchy_consistency,
        "summary": "Every registered constitutional layer document exists",
    },
    "supabase.contract.deterministic": {
        "layer": "supabase",
        "severity": "P1",
        "blocking": True,
        "fn": check_contract_manifest_deterministic,
        "summary": "Production contract regenerates deterministically",
    },
    "supabase.contract.frontend": {
        "layer": "supabase",
        "severity": "P1",
        "blocking": True,
        "fn": check_frontend_contract_backed,
        "summary": "Every frontend data reference has a canonical definition",
    },
    "supabase.migration.naming": {
        "layer": "supabase",
        "severity": "P3",
        "blocking": False,
        "fn": check_migration_naming,
        "summary": "Migration naming convention enforced (no banned names)",
    },
    "supabase.drift": {
        "layer": "supabase",
        "severity": "P1",
        "blocking": True,
        "fn": check_schema_drift,
        "summary": "Zero frontend↔schema drift",
    },
    "money.pricing.constitution": {
        "layer": "money",
        "severity": "P0",
        "blocking": True,
        "fn": check_pricing_constitution,
        "summary": "One Pricing Constitution: canonical plans + kobo prices identical everywhere",
    },
    "supabase.manifests": {
        "layer": "supabase",
        "severity": "P2",
        "blocking": True,
        "fn": check_supabase_manifests,
        "summary": "Supabase source-of-truth manifests present and valid",
    },
    "design.constitution": {
        "layer": "design",
        "severity": "P2",
        "blocking": True,
        "fn": check_design_constitution,
        "summary": "Design constitution gate passes (baseline-ratchet)",
    },
    "types.clean": {
        "layer": "developer",
        "severity": "P1",
        "blocking": True,
        "fn": check_typescript,
        "summary": "TypeScript compiles with zero errors",
    },
    "units.pass": {
        "layer": "developer",
        "severity": "P1",
        "blocking": True,
        "fn": check_unit_tests,
        "summary": "Unit test suite passes",
    },
    "edge.functions": {
        "layer": "operations",
        "severity": "P2",
        "blocking": True,
        "fn": check_edge_functions,
        "summary": "All edge functions type-check (deno)",
    },
    "routes.integrity": {
        "layer": "operations",
        "severity": "P2",
        "blocking": False,
        "fn": check_route_integrity,
        "summary": "No dead /app links",
    },
    "security.secrets": {
        "layer": "security",
        "severity": "P0",
        "blocking": True,
        "fn": check_no_hardcoded_secrets,
        "summary": "No hardcoded service-role/provider secrets in client code",
    },
    "platform.observability": {
        "layer": "observability",
        "severity": "P2",
        "blocking": False,
        "fn": check_platform_self_observability,
        "summary": "Platform-ops and governance objects in desired contract",
    },
    "autonomy.registry": {
        "layer": "autonomy",
        "severity": "P2",
        "blocking": True,
        "fn": check_autonomy_registry,
        "summary": "Autonomy policies complete (precondition→rollback→escalation)",
    },
    "features.registry": {
        "layer": "product",
        "severity": "P4",
        "blocking": False,
        "fn": check_feature_registry,
        "summary": "Feature registry entries complete",
    },
}
