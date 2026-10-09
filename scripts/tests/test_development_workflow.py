"""Infrastructure regressions; no project builds, services or databases."""

import json
import os
from pathlib import Path
import re
import runpy
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / "scripts/verification-snapshot.py"


class CiShellTest(unittest.TestCase):
    def setUp(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        # Enforce workflow-wide inheritance and disallow silent per-job overrides.
        shells = re.findall(r"^\s*shell:\s*(.+)$", workflow, re.MULTILINE)
        self.assertEqual(len(shells), 1, "Audit every additional shell override")
        self.assertIn(f"\ndefaults:\n  run:\n    shell: {shells[0]}\n\njobs:\n", workflow)
        self.shell = shlex.split(shells[0])
        self.assertEqual(self.shell, ["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "{0}"])

    def run_step(self, failing):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            body = "printf 'diagnostic\\n'; exit 7" if failing else "printf 'diagnostic\\n'"
            step = base / "step.sh"
            step.write_text(f"bash -c {shlex.quote(body)} 2>&1 | tee diagnostic.log\nprintf continued > following\n")
            result = subprocess.run([str(step) if part == "{0}" else part for part in self.shell],
                                    cwd=base, capture_output=True, text=True)
            return result, (base / "diagnostic.log").read_text(), (base / "following").exists()

    def test_failed_pipeline_keeps_diagnostics_and_stops_step(self):
        result, diagnostic, continued = self.run_step(True)
        self.assertEqual(result.returncode, 7)
        self.assertIn("diagnostic", diagnostic)
        self.assertFalse(continued)

    def test_successful_pipeline_continues(self):
        result, diagnostic, continued = self.run_step(False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("diagnostic", diagnostic)
        self.assertTrue(continued)


class SnapshotTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        (self.repo / ".gitignore").write_text(".runtime/\nnode_modules/\ndist/\n.env.local\n")
        (self.repo / "source.txt").write_text("initial\n")
        self.git("add", ".")
        # Seed only this disposable repository, never commit the project worktree.
        tree = self.git("write-tree").strip()
        commit = self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
                          "commit-tree", tree, "-m", "fixture").strip()
        self.git("update-ref", "HEAD", commit)
        self.before_path = self.repo / ".runtime/verification/test/before.json"
        self.after_path = self.repo / ".runtime/verification/test/after.json"

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True)

    def command(self, *args, cwd=None):
        return subprocess.run([sys.executable, "-B", str(SNAPSHOT), *map(str, args)],
                              cwd=cwd or self.repo, capture_output=True, text=True)

    def before(self):
        result = self.command("capture", "--scope", "fixture", "--output", self.before_path)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(self.before_path.read_text())

    def after(self, expected=0):
        result = self.command("check", "--before", self.before_path, "--output", self.after_path)
        self.assertEqual(result.returncode, expected, result.stderr)
        return json.loads(self.after_path.read_text())["comparison"]

    def test_unchanged_source_and_ignored_outputs_remain_stable(self):
        self.before()
        for name in ("node_modules/file", "dist/bundle", ".env.local", ".runtime/log"):
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("private-output")
        self.assertEqual(self.after()["status"], "STABLE")

    def test_same_dirty_status_with_different_bytes_is_changed(self):
        source = self.repo / "source.txt"
        source.write_text("first dirty value")
        self.before()
        status = self.git("status", "--porcelain")
        source.write_text("other dirty value")
        self.assertEqual(status, self.git("status", "--porcelain"))
        self.assertEqual(self.after(2)["changed_files"], ["source.txt"])

    def test_tracked_deletion_is_changed(self):
        self.before()
        (self.repo / "source.txt").unlink()
        self.assertEqual(self.after(2)["changed_files"], ["source.txt"])

    def test_untracked_addition_is_changed(self):
        self.before()
        (self.repo / "临床说明.txt").write_text("new")
        self.assertEqual(self.after(2)["changed_files"], ["临床说明.txt"])

    def test_untracked_deletion_is_changed(self):
        path = self.repo / "new.txt"
        path.write_text("new")
        self.before()
        path.unlink()
        self.assertEqual(self.after(2)["changed_files"], ["new.txt"])

    def test_restored_content_has_same_fingerprint(self):
        self.before()
        source = self.repo / "source.txt"
        source.write_text("temporary edit")
        source.write_text("initial\n")
        self.assertEqual(self.after()["status"], "STABLE")

    def test_symlink_hashes_link_text_without_following_it(self):
        outside = self.base / "outside"
        outside.write_text("SECRET_CONTENT_NOT_IN_REPORT")
        (self.repo / "link").symlink_to(outside)
        before = self.before()
        self.assertEqual(before["files"]["link"]["kind"], "symlink")
        self.assertNotIn("SECRET_CONTENT_NOT_IN_REPORT", self.before_path.read_text())
        outside.write_text("changed external target")
        self.assertEqual(self.after()["status"], "STABLE")
        (self.repo / "link").unlink()
        (self.repo / "link").symlink_to(self.base / "other")
        self.assertEqual(self.after(2)["changed_files"], ["link"])

    def test_executable_mode_is_part_of_source(self):
        self.before()
        (self.repo / "source.txt").chmod(0o755)
        self.assertEqual(self.after(2)["changed_files"], ["source.txt"])

    def test_revision_change_without_byte_changes_is_changed(self):
        self.before()
        self.git("checkout", "-q", "-b", "fixture-other")
        report = self.after(2)
        self.assertTrue(report["revision_changed"])
        self.assertEqual(report["changed_files"], [])

    def test_another_worktree_cannot_reuse_snapshot(self):
        self.before()
        other = self.base / "other-worktree"
        self.git("worktree", "add", "--detach", "-q", str(other))
        result = self.command("check", "--before", self.before_path,
                              "--output", other / ".runtime/verification/after.json", cwd=other)
        self.assertEqual(result.returncode, 2)
        self.assertIn("another worktree", result.stderr)

    def test_output_cannot_overwrite_source_or_before(self):
        result = self.command("capture", "--scope", "fixture", "--output", self.repo / "source.txt")
        self.assertEqual(result.returncode, 2)
        self.assertEqual((self.repo / "source.txt").read_text(), "initial\n")
        self.before()
        result = self.command("check", "--before", self.before_path, "--output", self.before_path)
        self.assertEqual(result.returncode, 2)

    def test_corrupt_manifest_is_rejected(self):
        report = self.before()
        report["source_sha256"] = "incorrect"
        self.before_path.write_text(json.dumps(report))
        result = self.command("check", "--before", self.before_path, "--output", self.after_path)
        self.assertEqual(result.returncode, 2)
        self.assertIn("fingerprint", result.stderr)

    def test_invalid_json_shape_returns_snapshot_error(self):
        self.before()
        self.before_path.write_text("[]")
        result = self.command("check", "--before", self.before_path, "--output", self.after_path)
        self.assertEqual(result.returncode, 2)
        self.assertIn("SNAPSHOT_ERROR", result.stderr)

    def test_tracked_ignored_file_is_still_source(self):
        path = self.repo / ".env.local"
        path.write_text("fixture value")
        self.git("add", "-f", ".env.local")
        self.before()
        path.write_text("changed fixture value")
        self.assertEqual(self.after(2)["changed_files"], [".env.local"])

    def test_capture_rejects_continuously_changing_source(self):
        module = runpy.run_path(str(SNAPSHOT))
        capture = module["capture"]
        with patch.dict(capture.__globals__, source_state=lambda root: {"version": os.urandom(16)}):
            with self.assertRaisesRegex(ValueError, "changed during capture"):
                capture(self.repo, "fixture")

    def fixture_scope(self):
        scripts = self.repo / "scripts"
        scripts.mkdir()
        shutil.copyfile(ROOT / "scripts/verify-scope.sh", scripts / "verify-scope.sh")
        shutil.copyfile(SNAPSHOT, scripts / SNAPSHOT.name)
        for name in ("src/shared/ui/Dialog.test.tsx",
                     "src/features/outpatient/ai/ClinicalEvidenceDrawer.test.tsx",
                     "src/features/outpatient/ai/MedicalInsertViewerModal.test.tsx"):
            path = self.repo / "frontend" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")
        binary = self.base / "bin"
        binary.mkdir()
        stub = binary / "npm"
        stub.write_text('#!/usr/bin/env bash\n'
                        'if [[ "$2" == test && "${FIXTURE_FAIL:-0}" == 1 ]]; then exit 9; fi\n'
                        'if [[ "$2" == build && "${FIXTURE_DRIFT:-0}" == 1 ]]; then printf changed >> ../source.txt; fi\n'
                        'echo "fixture npm $*"\n')
        stub.chmod(0o755)
        return {**os.environ, "PATH": str(binary) + os.pathsep + os.environ["PATH"]}

    def run_scope(self, environment, *args):
        return subprocess.run(["bash", "scripts/verify-scope.sh", "knowledge-panel", *args],
                              cwd=self.repo, env=environment, capture_output=True, text=True)

    def test_scope_preserves_test_failure_and_finishes_other_checks(self):
        environment = self.fixture_scope()
        environment["FIXTURE_FAIL"] = "1"
        result = self.run_scope(environment)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("FAIL frontend-tests", result.stderr)
        self.assertIn("PASS frontend-build", result.stdout)
        self.assertIn("STABLE", result.stdout)

    def test_scope_stable_success_returns_zero(self):
        result = self.run_scope(self.fixture_scope())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("STABLE", result.stdout)

    def test_scope_capture_failure_stops_checks(self):
        environment = self.fixture_scope()
        (self.repo / "scripts" / SNAPSHOT.name).unlink()
        result = self.run_scope(environment)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertNotIn("PASS frontend-tests", result.stdout)
        timing = next((self.repo / ".runtime/verification").glob("*/timings.tsv")).read_text()
        self.assertIn("source-capture\tFAIL", timing)

    def test_scope_source_drift_invalidates_attribution_and_preserves_failure(self):
        environment = self.fixture_scope()
        environment.update(FIXTURE_DRIFT="1", FIXTURE_FAIL="1")
        result = self.run_scope(environment)
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertIn("SOURCE_CHANGED", result.stderr)
        timing = next((self.repo / ".runtime/verification").glob("*/timings.tsv")).read_text()
        self.assertIn("frontend-tests\tFAIL", timing)
        self.assertIn("source-check\tINVALID", timing)

    def test_list_is_read_only(self):
        environment = self.fixture_scope()
        (self.repo / "scripts" / SNAPSHOT.name).unlink()
        result = self.run_scope(environment, "--list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[frontend-tests]", result.stdout)
        self.assertFalse((self.repo / ".runtime").exists())


if __name__ == "__main__":
    unittest.main()
