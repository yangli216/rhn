# Project Instructions

## Browser automation

- For all browser-related work in this project, use the `ego-browser` skill and ego-lite by default.
- This includes opening or navigating pages, interacting with forms and controls, taking screenshots, extracting page data, and browser-based testing or QA.
- Use another browser tool only when the user explicitly requests it or ego-lite cannot perform the required task; state the reason before switching.

## Services for manual verification

- Preserve the main checkout's persistent manual-verification services: backend `8080` / frontend `5173` at `/Users/yangl/IdeaProjects/rhn`.
- The persistent backend must use `oracle-local`. Never start it with ephemeral `local` or `test` profiles.
- Backend tests must use the isolated `test` profile and random H2 databases, never the manual Oracle schema or persistent service ports.
- Frontend ports and API targets can be set through ignored `frontend/.env.local`: `RHN_FRONTEND_PORT` and `RHN_API_TARGET`.
- Before handing work back, verify backend `8080` `/actuator/health` and frontend `5173` URL are reachable. Restore unavailable project services and report status.
- Temporary test instances must use dedicated non-project ports. Track and stop only exact temporary processes started by the current task; never use broad termination such as `pkill` or `killall`.
- Completing browser task spaces must not stop persistent project services.

## Git submission rules

- Do not automatically commit or push local changes to the Git repository.
- Only run `git commit` or `git push` when the user explicitly requests it.

## Frontend desktop-only layout constraints (PC 端浏览器适配与布局约束)

- **默认仅适配 PC 端浏览器**：本项目前端默认只需要适配 PC 端桌面浏览器（基准视口宽度 1280px ~ 1920px+，如 1440px / 1920px 常见医疗工作站显示器），**非特殊说明无需考虑移动端（手机/窄屏平板等）兼容性**。
- **坚决杜绝“长条型”单列堆叠布局**：严禁将 PC 页面实现为单列垂直居中堆叠、在大屏两侧留出大量无用空白的狭长条页面；严禁将多个业务区块做无意义的单列纵向拉伸排版。
- **充分利用 PC 宽屏空间**：页面应优先采用多列栅格（Grid）、左右分栏/三栏协同（Split Panes，如左侧导航/队列 + 中间临床作业 + 右侧辅助/时间轴/检查报告）、横向自适应卡片流及高密度信息工作台，提高桌面端可视面积利用率与操作效率。
- **无需编写移动端专属逻辑**：除非业务明确要求，不要编写针对手机尺寸（如 ≤760px / 320px）的单列折叠媒体查询、移动抽屉菜单或底部移动导航栏，避免增加无用复杂度与冗余代码。
