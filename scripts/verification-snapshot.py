#!/usr/bin/env python3
"""Attribute local verification to source bytes, without storing source contents."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from datetime import datetime, timezone


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def source_state(root):
    head = git(root, "rev-parse", "HEAD").decode().strip()
    ref = git(root, "rev-parse", "--abbrev-ref", "HEAD").decode().strip()
    names = sorted(set(git(root, "ls-files", "--cached", "--others",
                           "--exclude-standard", "-z").split(b"\0")) - {b""})
    files = {}
    for raw_name in names:
        name = os.fsdecode(raw_name)
        path = root / name
        try:
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                kind, content = "symlink", os.fsencode(os.readlink(path))
            elif stat.S_ISREG(mode):
                kind, content = "file", path.read_bytes()
            else:
                raise ValueError(f"Unsupported source file type: {name}")
            files[name] = {"kind": kind, "executable": bool(mode & stat.S_IXUSR),
                           "sha256": hashlib.sha256(content).hexdigest()}
        except FileNotFoundError:
            # Tracked deletions are part of the source state, not a read error.
            files[name] = {"kind": "missing"}
    encoded = json.dumps(files, sort_keys=True, ensure_ascii=True).encode()
    return {"head": head, "ref": ref, "files": files,
            "source_sha256": hashlib.sha256(encoded).hexdigest()}


def capture(root, scope):
    # Two matching scans reduce the chance of reporting a mixed source snapshot.
    # Endpoint checks cannot detect edits that were subsequently restored.
    previous = source_state(root)
    for _ in range(3):
        current = source_state(root)
        if current == previous:
            return {"format_version": 1, "worktree": str(root), "scope": scope,
                    "captured_at": datetime.now(timezone.utc).isoformat(), **current}
        previous = current
    raise ValueError("Source changed during capture; use an isolated worktree and retry")


def validate_report(report):
    if not isinstance(report, dict):
        raise ValueError("Snapshot must be a JSON object")
    if report.get("format_version") != 1:
        raise ValueError("Unsupported snapshot format")
    for key in ("worktree", "head", "ref", "scope", "source_sha256"):
        if not isinstance(report.get(key), str):
            raise ValueError(f"Invalid snapshot field: {key}")
    if not isinstance(report.get("files"), dict):
        raise ValueError("Invalid snapshot files")
    encoded = json.dumps(report["files"], sort_keys=True, ensure_ascii=True).encode()
    if hashlib.sha256(encoded).hexdigest() != report["source_sha256"]:
        raise ValueError("Snapshot fingerprint does not match its file manifest")


def comparison(before, after):
    validate_report(before)
    validate_report(after)
    if before["worktree"] != after["worktree"]:
        raise ValueError("Snapshot belongs to another worktree")
    names = sorted(set(before["files"]) | set(after["files"]))
    changed = [name for name in names if before["files"].get(name) != after["files"].get(name)]
    identity_changed = any(before[key] != after[key] for key in ("head", "ref"))
    return {"status": "SOURCE_CHANGED" if changed or identity_changed else "STABLE",
            "changed_files": changed, "revision_changed": identity_changed,
            "before_source_sha256": before["source_sha256"]}


def output_path(root, output):
    path = Path(output).resolve()
    # Reports must not change the source they measure or overwrite a source file.
    base = (root / ".runtime" / "verification").resolve()
    if base == path or base not in path.parents:
        raise ValueError("Snapshot output must be inside .runtime/verification of this worktree")
    relative = str(path.relative_to(root))
    if git(root, "ls-files", "--", relative).strip():
        raise ValueError("Snapshot output must not be tracked")
    ignored = subprocess.run(["git", "-C", str(root), "check-ignore", "-q", "--", relative])
    if ignored.returncode != 0:
        raise ValueError("Snapshot output must be ignored by Git")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("capture")
    start.add_argument("--scope", required=True)
    start.add_argument("--output", required=True)
    end = commands.add_parser("check")
    end.add_argument("--before", required=True)
    end.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").decode().strip()).resolve()
        output = output_path(root, args.output)
        before = None
        if args.command == "check":
            before_path = Path(args.before).resolve()
            if before_path == output:
                raise ValueError("Before and after snapshots must use different files")
            before = json.loads(before_path.read_text(encoding="utf-8"))
            validate_report(before)
            if before["worktree"] != str(root):
                raise ValueError("Snapshot belongs to another worktree")
        report = capture(root, args.scope if before is None else before["scope"])
        if before is not None:
            report["comparison"] = comparison(before, report)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_name(f"{output.name}.{os.getpid()}.tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
        status = report.get("comparison", {}).get("status", "CAPTURED")
        print(f"{status}: HEAD={report['head']} source={report['source_sha256']}; {output}")
        if status == "SOURCE_CHANGED":
            print("Source/revision changed during verification; results do not describe one fixed snapshot.", file=sys.stderr)
            print("See changed_files in the after snapshot. Test failures still require separate analysis.", file=sys.stderr)
            return 2
        return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"SNAPSHOT_ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
