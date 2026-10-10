#!/usr/bin/env python3
"""Resolve maintained scope mappings and combine overlapping checks once."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent


def plan(root, requested, frontend_only=False, full=False):
    raw = (root / "scripts/verification-scopes.json").read_bytes()
    catalog = json.loads(raw)
    if catalog.get("version") != 1 or not isinstance(catalog.get("scopes"), dict):
        raise ValueError("Invalid scope catalog")
    names = list(dict.fromkeys(requested.split(",")))
    if not names or any(not re.fullmatch(r"[a-z][a-z0-9-]*", name) for name in names):
        raise ValueError("Use a scope name or comma-separated scope names")
    unknown = [name for name in names if name not in catalog["scopes"]]
    if unknown:
        raise ValueError("Unknown scopes: " + ", ".join(unknown))
    selected = [catalog["scopes"][name] for name in names]
    if full and frontend_only:
        raise ValueError("--full includes backend verification; do not combine with --frontend-only")
    frontend_only = frontend_only or (not full and all(scope["frontend_only"] for scope in selected))
    frontend = list(dict.fromkeys(test for scope in selected for test in scope["frontend"]))
    backend = [] if frontend_only else list(dict.fromkeys(test for scope in selected for test in scope["backend"]))
    for test in frontend:
        if not test.startswith("src/") or ".." in Path(test).parts or not (root / "frontend" / test).is_file():
            raise ValueError("Missing/invalid frontend test: " + test)
    for test in backend:
        if not re.fullmatch(r"(?:com\.rhn\.)?[A-Za-z][A-Za-z0-9_.]*", test):
            raise ValueError("Invalid backend test: " + test)
        relative = test.removeprefix("com.rhn.").replace(".", "/") + ".java"
        if not (root / "backend/src/test/java/com/rhn" / relative).is_file():
            raise ValueError("Missing backend test: " + test)
    if full:
        frontend = sorted(str(test.relative_to(root / "frontend")) for test in (root / "frontend/src").rglob("*")
                          if test.is_file() and re.search(r"\.(test|spec)\.[cm]?[jt]sx?$", test.name))
        backend = sorted(str(test.relative_to(root / "backend/src/test/java")).removesuffix(".java").replace("/", ".")
                         for test in (root / "backend/src/test/java").rglob("*Test.java"))
    return {"version": 1, "scopes": names, "frontend_only": frontend_only, "full": full,
            "catalog_sha256": hashlib.sha256(raw).hexdigest(),
            "coverage": list(dict.fromkeys(value for scope in selected for value in scope["coverage"])),
            "limitations": list(dict.fromkeys(value for scope in selected for value in scope["limitations"])),
            "frontend_tests": frontend, "backend_tests": backend,
            "common_checks": ["ui-standards", "code-quality", "frontend-build"],
            "backend_profile": None if frontend_only else "test"}


def result_summary(directory, selected):
    before_path = directory / "source-before.json"
    after_path = directory / "source-after.json"
    before = json.loads(before_path.read_text()) if before_path.exists() else None
    after = json.loads(after_path.read_text()) if after_path.exists() else None
    with (directory / "timings.tsv").open() as stream:
        stages = list(csv.DictReader(stream, delimiter="\t"))
    stable = after and after.get("comparison", {}).get("status") == "STABLE"
    status = "INVALID" if not stable else "FAIL" if any(stage["status"] != "PASS" for stage in stages) else "PASS"
    return {"status": status, "plan": selected, "stages": stages,
            "source": {"head": before.get("head") if before else None,
                       "sha256": before.get("source_sha256") if before else None,
                       "captured_at": before.get("captured_at") if before else None,
                       "after_status": after.get("comparison", {}).get("status") if after else None},
            "logs": str(directory)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scopes")
    parser.add_argument("--frontend-only", action="store_true")
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--format", choices=("shell", "json"), default="shell")
    parser.add_argument("--result-directory")
    args = parser.parse_args()
    try:
        if args.result_directory:
            directory = Path(args.result_directory).resolve()
            base = (ROOT / ".runtime/verification").resolve()
            if base not in directory.parents:
                raise ValueError("Results must be inside this worktree's .runtime/verification")
            # Use the exact plan captured before checks, not a mapping edited later.
            selected = json.loads((directory / "scope-plan.json").read_text())
            (directory / "summary.json").write_text(json.dumps(result_summary(directory, selected), ensure_ascii=False, indent=2) + "\n")
            print("Verification summary: " + str(directory / "summary.json"))
        else:
            selected = plan(ROOT, args.scopes, args.frontend_only, args.full)
            if args.format == "json":
                print(json.dumps(selected, ensure_ascii=False, indent=2))
            else:
                print("frontend_only\t" + str(int(selected["frontend_only"])))
                for test in selected["frontend_tests"]:
                    print("frontend\t" + test)
                for test in selected["backend_tests"]:
                    print("backend\t" + test)
                print("coverage\t" + "；".join(selected["coverage"]))
    except (OSError, ValueError, KeyError, TypeError) as error:
        print("Scope setup error: " + str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
