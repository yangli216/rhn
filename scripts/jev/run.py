"""Real Jev decisions + upstream Browser Harness execution + independent DOM assertions."""

import argparse
import json
import os
import subprocess
import tempfile
import time
import traceback
import uuid
from pathlib import Path
from urllib.request import urlopen

from policy import GOAL, RESULT_LABEL, SEARCH, passed, project_state

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime/jev-pilot"
REVISION = "1231850a0bf1a0c0341fe408ef1668dbbfdfac46"
EVIDENCE = """(() => {
 const visible = e => e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const panel = document.getElementById('workspace-panel-%2Foutpatient%2Fregistration-query');
 return {
  route: location.pathname === '/outpatient/registration-query',
  heading: !!panel && [...panel.querySelectorAll('h1,h2')].some(e=>visible(e)&&e.textContent.trim()==='挂号查询'),
  keyword: !!panel && [...panel.querySelectorAll('input')].some(e=>visible(e)&&
    (e.getAttribute('aria-label')==='挂号记录关键词'||[...(e.labels||[])].some(l=>l.textContent.includes('挂号记录关键词')))),
  query: !!panel && [...panel.querySelectorAll('button')].some(e=>visible(e)&&e.textContent.trim()==='查询')
 };
})()"""


def wait_until(fn, seconds=20):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(0.1)
    raise TimeoutError("Timed out waiting for browser or application readiness")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-decisions", type=int, default=12)
    args = parser.parse_args()
    if not 1 <= args.max_decisions <= 30:
        parser.error("max-decisions must be between 1 and 30")
    env_file = RUNTIME / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith(("TYPESAFE_API_KEY=", "TYPESAFE_MODEL=")):
                k, v = line.split("=", 1)
                os.environ.setdefault(k, v)
    if not os.environ.get("TYPESAFE_API_KEY"):
        parser.error("Set TYPESAFE_API_KEY in .runtime/jev-pilot/.env (chmod 600)")
    for url in ("http://localhost:8080/actuator/health", "http://localhost:5173/"):
        with urlopen(url, timeout=5) as response:
            if response.status != 200:
                raise RuntimeError("Persistent project service unavailable")
    chrome = os.environ.get(
        "RHN_JEV_CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    )
    if not Path(chrome).is_file():
        parser.error("Set RHN_JEV_CHROME to a Chrome/Chromium executable")
    name = "rhn-jev-" + uuid.uuid4().hex[:8]
    os.environ.update(BU_NAME=name, BH_RECORD="0", BH_TAB_MARKER="0", BH_TELEMETRY="0")
    os.environ.pop("BU_CDP_WS", None)
    # httpx 0.28 rejects unbracketed IPv6 NO_PROXY entries (e.g. ::1/128).
    # This pilot binds IPv4 loopback; preserve all other proxy exclusions.
    for key in ("NO_PROXY", "no_proxy"):
        if key in os.environ:
            os.environ[key] = ",".join(
                v
                for v in os.environ[key].split(",")
                if v.strip() not in {"::1", "::1/128"}
            )
    report = {
        "scenario": "module-search-registration",
        "revision": REVISION,
        "passed": False,
        "decisions": [],
        "history": [],
        "evidence": {},
        "scope": "module navigation only; no business data assertions",
    }
    started = time.perf_counter()
    browser = None
    restart = None
    with tempfile.TemporaryDirectory(prefix="chrome-", dir=RUNTIME) as profile:
        with open(RUNTIME / (name + "-chrome.log"), "w") as log:
            child_env = {
                k: v
                for k, v in os.environ.items()
                if k not in {"TYPESAFE_API_KEY", "TEXT_MODEL_API_KEY"}
            }
            chrome_process = subprocess.Popen(
                [
                    chrome,
                    "--headless=new",
                    "--remote-debugging-port=0",
                    "--remote-debugging-address=127.0.0.1",
                    f"--user-data-dir={profile}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "about:blank",
                ],
                stdout=log,
                stderr=log,
                env=child_env,
            )
            try:
                port_file = Path(profile) / "DevToolsActivePort"
                wait_until(lambda: port_file.exists())
                port = int(port_file.read_text().splitlines()[0])
                os.environ["BU_CDP_URL"] = f"http://127.0.0.1:{port}"
                # Import after setting the dedicated daemon and CDP endpoint.
                from browser_harness.admin import restart_daemon
                from jev_ultrafast.browser import Browser, StalePage
                from jev_ultrafast.model import choose

                restart = restart_daemon
                browser = Browser("http://localhost:5173/")
                browser.call(
                    "Emulation.setDeviceMetricsOverride",
                    width=1440,
                    height=1000,
                    deviceScaleFactor=1,
                    mobile=False,
                )

                # Deterministic setup: use the application's prefilled local demo login.
                # No credentials or login page state is ever sent to Jev.
                def login_ready():
                    page = browser.observe(screenshot=False)
                    return (
                        next(
                            (
                                a
                                for a in page["actions"]
                                if a["kind"] == "click" and a["label"] == "进入工作台"
                            ),
                            None,
                        )
                        and page
                    )

                login_page = wait_until(login_ready)
                action = next(
                    a for a in login_page["actions"] if a["label"] == "进入工作台"
                )
                browser.act(action, login_page)
                wait_until(
                    lambda: browser.evaluate(
                        "!!document.querySelector('button[aria-label=\"搜索模块\"]')"
                    )
                )
                report["setup_ms"] = round((time.perf_counter() - started) * 1000)
                loop_started = time.perf_counter()
                for _ in range(args.max_decisions):
                    if time.perf_counter() - loop_started > 120:
                        raise TimeoutError(
                            "Pilot exceeded 120-second decision-loop budget"
                        )
                    page = browser.observe(screenshot=False)
                    if not page["url"].startswith("http://localhost:5173/"):
                        raise RuntimeError("Browser left the permitted local origin")
                    evidence = browser.evaluate(EVIDENCE)
                    report["evidence"] = evidence
                    if passed(evidence, report["history"]):
                        report["passed"] = True
                        report["completion_source"] = "independent_dom_assertions"
                        break
                    view = project_state(page, evidence)
                    decision = choose(view, GOAL, report["history"])
                    entry = {
                        k: decision[k]
                        for k in (
                            "operation",
                            "target",
                            "confidence",
                            "latency_ms",
                            "model",
                            "usage",
                        )
                    }
                    report["decisions"].append(entry)
                    print(json.dumps(entry, ensure_ascii=False), flush=True)
                    if decision["choice"] in {"DONE", "BLOCKED"}:
                        # A fresh independent read, never inferred from the model response.
                        report["evidence"] = browser.evaluate(EVIDENCE)
                        report["passed"] = decision["choice"] == "DONE" and passed(
                            report["evidence"], report["history"]
                        )
                        break
                    permitted = {a["id"] for a in view["actions"]}
                    if decision["choice"] not in permitted:
                        raise ValueError("Model chose an action outside the allowlist")
                    action = next(
                        a for a in page["actions"] if a["id"] == decision["choice"]
                    )
                    try:
                        browser.act(
                            action,
                            page,
                            text=SEARCH if action["kind"] == "fill" else None,
                        )
                    except StalePage:
                        entry["stale"] = True
                        continue
                    report["history"].append(
                        {
                            "action": action["label"],
                            "kind": action["kind"],
                            "text": SEARCH if action["kind"] == "fill" else None,
                            "page_changed": None,
                        }
                    )
                    if action["label"] == RESULT_LABEL:
                        # Known lazy-route loading is a deterministic wait, not another AI decision.
                        def destination_ready():
                            current = browser.evaluate(EVIDENCE)
                            return current if passed(current, report["history"]) else None

                        report["evidence"] = wait_until(destination_ready, seconds=15)
                        report["passed"] = True
                        report["completion_source"] = "independent_dom_assertions"
                        break
                report["loop_ms"] = round((time.perf_counter() - loop_started) * 1000)
                if not report["passed"]:
                    report["error"] = (
                        "Independent assertions did not pass within the decision budget"
                    )
            except Exception as exc:
                # Exception strings may contain provider response or request data; omit them.
                report["error"] = type(exc).__name__
                report["error_frames"] = [
                    f"{Path(f.filename).name}:{f.lineno}:{f.name}"
                    for f in traceback.extract_tb(exc.__traceback__)
                ]
            finally:
                try:
                    if browser:
                        browser.close()
                    if restart:
                        restart(name=name)
                except Exception:
                    report["cleanup_error"] = "Browser/daemon cleanup failed"
                    report["passed"] = False
                chrome_process.terminate()
                try:
                    chrome_process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    chrome_process.kill()
                    chrome_process.wait(timeout=5)
    report["total_ms"] = round((time.perf_counter() - started) * 1000)
    output = RUNTIME / (name + "-report.json")
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {output}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
