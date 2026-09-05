# Project Instructions

## Browser automation

- For all browser-related work in this project, use the `ego-browser` skill and ego-lite by default.
- This includes opening or navigating pages, interacting with forms and controls, taking screenshots, extracting page data, and browser-based testing or QA.
- Use another browser tool only when the user explicitly requests it or ego-lite cannot perform the required task; state the reason before switching.

## Services for manual verification

- Treat the backend on port `8080` and the frontend on port `5173` as persistent manual-verification services. Do not stop them when automated checks or browser QA finish.
- The persistent backend on port `8080` must use the `oracle-local` profile. Never start the persistent manual-verification service with the ephemeral `local` or `test` profile.
- Backend tests must keep using the isolated `test` profile and its random H2 database. Tests must not connect to the manual Oracle schema or bind to port `8080`.
- Before handing work back for manual verification, confirm both `http://localhost:8080/actuator/health` and `http://localhost:5173` are reachable. If either project service is unavailable, start or restore it and report the URLs and status.
- Temporary test instances must use dedicated non-project ports and may be cleaned up after their check. Never terminate a pre-existing service on `8080` or `5173` as part of temporary cleanup.
- Never use broad process termination such as `pkill` or `killall` for project verification. Track and stop only the exact temporary process that the current task started.
- Leave browser task spaces and project services in different lifecycles: completing an ego-lite task space must not stop the backend or frontend processes.

## Git submission rules

- Do not automatically commit or push local changes to the Git repository.
- Only run `git commit` or `git push` when the user explicitly requests it.

## Frontend desktop-only layout constraints (PC 端浏览器适配与布局约束)

- **默认仅适配 PC 端浏览器**：本项目前端默认只需要适配 PC 端桌面浏览器（基准视口宽度 1280px ~ 1920px+，如 1440px / 1920px 常见医疗工作站显示器），**非特殊说明无需考虑移动端（手机/窄屏平板等）兼容性**。
- **坚决杜绝“长条型”单列堆叠布局**：严禁将 PC 页面实现为单列垂直居中堆叠、在大屏两侧留出大量无用空白的狭长条页面；严禁将多个业务区块做无意义的单列纵向拉伸排版。
- **充分利用 PC 宽屏空间**：页面应优先采用多列栅格（Grid）、左右分栏/三栏协同（Split Panes，如左侧导航/队列 + 中间临床作业 + 右侧辅助/时间轴/检查报告）、横向自适应卡片流及高密度信息工作台，提高桌面端可视面积利用率与操作效率。
- **无需编写移动端专属逻辑**：除非业务明确要求，不要编写针对手机尺寸（如 ≤760px / 320px）的单列折叠媒体查询、移动抽屉菜单或底部移动导航栏，避免增加无用复杂度与冗余代码。
