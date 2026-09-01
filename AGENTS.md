# Project Instructions

## Browser automation

- For all browser-related work in this project, use the `ego-browser` skill and ego-lite by default.
- This includes opening or navigating pages, interacting with forms and controls, taking screenshots, extracting page data, and browser-based testing or QA.
- Use another browser tool only when the user explicitly requests it or ego-lite cannot perform the required task; state the reason before switching.

## Services for manual verification

- Treat the backend on port `8080` and the frontend on port `5173` as persistent manual-verification services. Do not stop them when automated checks or browser QA finish.
- Before handing work back for manual verification, confirm both `http://localhost:8080/actuator/health` and `http://localhost:5173` are reachable. If either project service is unavailable, start or restore it and report the URLs and status.
- Temporary test instances must use dedicated non-project ports and may be cleaned up after their check. Never terminate a pre-existing service on `8080` or `5173` as part of temporary cleanup.
- Never use broad process termination such as `pkill` or `killall` for project verification. Track and stop only the exact temporary process that the current task started.
- Leave browser task spaces and project services in different lifecycles: completing an ego-lite task space must not stop the backend or frontend processes.

## Git submission rules

- Do not automatically commit or push local changes to the Git repository.
- Only run `git commit` or `git push` when the user explicitly requests it.

