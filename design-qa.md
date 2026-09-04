# Outpatient doctor record PCIE-style presentation QA

- Source visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-6f62c3df-6373-4ccd-b32c-84b405e63d03.png` plus the PCIE reference implementation in `/Users/yangl/IdeaProjects/floating-ball/src/features/consultation-result/ui/ClinicalResultEditor.css` and `VoiceRecordFieldEditor.vue`.
- Browser-rendered implementation: `/tmp/rhn-pcie-record-1767-final2.png`.
- Combined comparison: `/tmp/rhn-pcie-record-comparison-final.png`.
- Source pixels: 755 × 779 at 1× density. The source is an annotated crop of the patient context and left record panel.
- Implementation pixels and CSS viewport: 1767 × 1038 at device scale factor 1. The left context-and-record region was cropped without scaling for the focused comparison; the combined comparison is 1404 × 823.
- State: authenticated outpatient doctor station, in-progress patient opened in editing mode, empty unsaved record, chief-complaint field focused.

## Full-view comparison evidence

The browser capture confirms that the former standalone template row is removed and the template selector, import action and save-template action now share the record title bar. The record and order columns remain bottom-aligned and the 1767 px viewport has no horizontal overflow.

The record body follows the PCIE document presentation: a white document surface, bold stable section labels, borderless narrative text, content-height fields, quiet default state and a restrained hover/focus wash with a single edit underline. Structured vital signs remain visibly grouped because they are measurements rather than narrative prose.

## Focused region comparison evidence

The combined image places the annotated source crop and the final left-panel implementation together. It shows the requested removal of the second template row and the reduction from five persistent bordered text boxes to one continuous clinical document. The focused chief-complaint state demonstrates the edit affordance without restoring form-box chrome.

## Fidelity surfaces

- Fonts and typography: the existing RHN family and scale are retained; section labels use the stronger PCIE-style document weight, while narrative text keeps the normal clinical reading weight and line height. No copy wraps or truncates unexpectedly at the checked desktop widths.
- Spacing and layout rhythm: the template controls occupy one 57 px heading row. Narrative sections use compact content-driven heights and expand with content; the second pass reduced empty-field minimum heights after the first comparison found excessive vertical gaps.
- Colors and visual tokens: RHN green and neutral surface tokens remain authoritative. PCIE's quiet white document treatment and low-opacity edit feedback are mapped to existing RHN semantic tokens instead of copying its blue theme.
- Image quality and asset fidelity: the target region contains no imagery. Existing shared controls and icon-library assets are retained; no placeholder, emoji, custom SVG or decorative raster was introduced.
- Copy and content: all clinical labels, placeholders, validation semantics, record status and template actions are preserved. No AI-generated content or AI capability claim is shown in this presentation-only release.

## Interaction, accessibility and responsive checks

- “存为模板” opens the existing save-template dialog and cancel closes it without mutation.
- The chief-complaint field receives keyboard focus, retains its accessible label and required state, and exposes a visible focus treatment.
- At 1767 × 1038 and 1280 × 900 there is no document-level horizontal overflow; the template selector remains inside the record heading at both widths.
- The record and order panels share the same bottom edge in the primary desktop state.
- ego-lite event output contained no console or runtime error events.
- The focused outpatient test suite, TypeScript production build and UI standards check pass.

## Comparison history

1. The first implementation merged the template row and introduced the PCIE-style document surface. The combined comparison found one P2 density issue: minimum textarea heights left more empty vertical space than the content-driven PCIE fields.
2. Narrative minimum heights were reduced and native resize handles were replaced with content sizing, allowing longer clinical text to expand without restoring persistent boxes.
3. Post-fix evidence shows compact narrative rhythm, complete vital-sign values, a single-row header, zero horizontal overflow and working template/focus interactions. No actionable P0/P1/P2 differences remain for the requested presentation scope.

## Findings

No actionable P0/P1/P2 differences remain. Inline AI annotations, evidence popovers and AI draft generation are intentionally deferred; this release establishes the document presentation and interaction surface they can later occupy.

final result: passed

---

# Inpatient doctor and nurse station reference-structure design QA

- Source visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-918228ec-83cc-4fff-8e4d-27b8b5e38ec3.png` and `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-a6c495ff-7945-4723-99a6-295cb9ec6b75.png`.
- Browser-rendered implementation: `docs/audits/2026-08-31-inpatient-stations-reference-structure/01-doctor-patient-pool.png`, `02-doctor-selected-patient.png`, `03-nurse-patient-pool.png`, and `04-nurse-selected-patient.png`.
- Source pixels: patient pool 1549 × 733 and selected patient 1549 × 795, density 1×.
- Implementation pixels and CSS viewport: 1549 × 795 at device scale factor 1. The selected-patient comparison is pixel-dimension aligned; the shorter patient-pool source was compared at the same width without vertical stretching.
- State: authenticated comprehensive ward context; patient-pool default state and first-patient selected state for both stations.

## Full-view comparison evidence

The six-image combined comparison includes both supplied references and all four implementation states. The implementation intentionally retains RHN's green foundation, global navigation and existing clinical modules instead of copying the blue legacy styling. It preserves the reference interaction model: the default screen is a searchable, switchable patient pool; selecting a patient opens a persistent left patient queue, a fixed patient context header, task-oriented business tabs and a dense working surface.

The doctor station enters medical orders after selection and the nurse station enters execution tasks. Both keep bed/name switching in place, expose a clear return to the patient pool and keep the patient context visible while the business surface scrolls. The nurse pool presents ward metrics above patient cards and moves bed operations into a collapsed secondary section so it does not duplicate the primary patient list.

## Focused region comparison evidence

Separate focused crops were not needed because the 1549 px full-size captures keep the patient rail, identity header, tabs, labels and first business rows legible. DOM measurements supplement the visible comparison: selected workspaces use a 216 px patient rail, the doctor main surface has equal 1004 px client and scroll widths, patient titles remain one line, and document horizontal overflow is zero.

## Fidelity surfaces

- Fonts and typography: the project font family, RHN heading scale and semantic badge weights are preserved. Patient names, bed numbers and task titles remain primary; long names truncate in the fixed context header instead of increasing its height.
- Spacing and layout rhythm: the patient pool uses a compact responsive card grid; selected state uses a stable 216 px rail plus flexible main surface. Toolbars, context header, tabs and content share borders and tokenized spacing with no horizontal overflow.
- Colors and visual tokens: RHN green, neutral surfaces and existing success/warning/danger tokens replace the legacy blue palette intentionally. Urgent/critical conditions and key nursing states keep semantic emphasis.
- Image quality and asset fidelity: existing project icon-library patient, search, menu and task icons are used. No emoji, placeholder artwork, custom CSS drawing or raster approximation was introduced.
- Copy and content: search supports住院号/床号/姓名; cards expose bed, identity, stay day, ward, admission reason and nursing level; selected headers expose payment, condition, nursing level, episode, bed, ward and admission time.

## Interaction, accessibility and responsive checks

- Patient card selection opens the correct task-oriented default tab: 医嘱 for doctors and 执行任务 for nurses.
- Left-rail patient switching, return to patient pool, card/list view switching and collapsed bed-management disclosure were exercised successfully.
- Shared tabs preserve tab semantics and keyboard behavior; patient-card and rail actions are real buttons with accessible names/current state.
- Browser measurements report no document or main-workspace horizontal overflow at 1549 × 795.
- ego-lite event drain reported no console/runtime error events. UI standards, 90 automated tests, TypeScript compilation and production build pass.

## Comparison history

1. The first implementation established the patient-pool and selected-patient workspace model. Visual comparison found two P2 issues: the long selected patient name wrapped to two lines, and the nurse default screen repeated the same patient list below the card pool.
2. The patient name changed to a one-line ellipsis within the fixed header. The duplicate nurse ward list was removed from the default state, while bed management was retained as a collapsed secondary section.
3. Post-fix evidence confirms a one-line selected-patient header, a single primary patient pool in the nurse default state, zero horizontal overflow and working forward/back interactions.

## Findings

No actionable P0/P1/P2 differences remain for the requested structural and interaction scope. The main visible differences from the references—RHN color system, global application navigation and existing task module presentation—are intentional because the user requested the reference design principles rather than a visual clone.

final result: passed

---

# Shared form hint tooltip design QA

- User-annotated visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-d2a67636-b460-48bd-9e87-24e4139b8a5a.png`.
- Normalized source state: `docs/audits/form-field-hint-tooltip-2026-08-28/01-before.png`.
- Browser-rendered implementation: `docs/audits/form-field-hint-tooltip-2026-08-28/02-after.png`.
- Hover evidence: `docs/audits/form-field-hint-tooltip-2026-08-28/03-tooltip-hover.png`.
- Validation evidence: `docs/audits/form-field-hint-tooltip-2026-08-28/04-validation.png`.
- Responsive evidence: `docs/audits/form-field-hint-tooltip-2026-08-28/05-responsive-720.png`.
- Cross-screen evidence: `docs/audits/form-field-hint-tooltip-2026-08-28/06-parameter-form-global.png`.
- Full-view comparison: `docs/audits/form-field-hint-tooltip-2026-08-28/07-before-after-comparison.png`.
- Viewport and density: matched source and implementation are 1580 × 900 CSS px at 1× density; the responsive check is 720 × 900 CSS px at 1× density. No normalization was required for the matched comparison.
- State: authenticated `/settings/dictionaries`, category-management dialog open on “基础数据”, no data mutation.

## Full-view comparison evidence

The combined comparison places the matched pre-change render on the left and the revised render on the right. The three persistent helper lines under “分类编码”, “分类说明” and “变更原因” are removed from the layout and replaced by restrained information icons immediately after the corresponding labels. Field grouping, values, actions, tree state and RHN visual language remain unchanged while the editor becomes more compact and quieter.

## Focused region comparison evidence

- The hover capture shows “创建后不可修改” in a dark, readable tooltip above the label icon. The portal-based overlay remains fully inside the viewport and is not clipped by the scrolling dialog.
- Keyboard focus on “分类说明” exposes the same tooltip text and the trigger plus field control both reference an always-present accessible description.
- Empty create submission keeps “请输入分类名称” and “请输入分类编码” visibly attached below invalid controls; validation guidance was intentionally not moved into tooltips.
- The parameter-create dialog independently renders the shared label-icon pattern for “参数键” and “默认值”, confirming this is a form-foundation change rather than a dictionary-specific exception.

## Fidelity surfaces

- Fonts and typography: existing RHN font family, label weight, required marker, field text and small-copy scale are preserved. Tooltip copy uses the existing small text scale and regular weight.
- Spacing and layout rhythm: information icons occupy a 20 px label-row target without increasing field height; helper paragraphs no longer add vertical space. Existing control heights, grid tracks, gaps, borders and radii remain unchanged.
- Colors and visual tokens: icons use muted text color at rest and brand color plus soft brand surface on hover/focus. Tooltip foreground, dark surface, border and shadow all use existing semantic tokens.
- Image quality and asset fidelity: the shared existing `info` icon is used; no raster, placeholder, emoji, custom CSS drawing or new image asset is introduced.
- Copy and content: every existing hint string is preserved verbatim and revealed on demand. Validation copy remains persistent when an error exists.

## Interaction, accessibility and responsive checks

- Mouse hover displays the correct tooltip text; leaving the trigger removes it.
- Keyboard focus displays the same tooltip. The trigger has an explicit accessible name, and form controls retain `aria-describedby` references to the hint text.
- Tooltips are rendered at document level with viewport-aware horizontal positioning, so dialog overflow does not crop them.
- At 720 × 900 the category dialog has no document or dialog horizontal overflow; label icons remain aligned and validation copy remains readable.
- ego-lite confirmed no persistent non-error helper nodes, three category hint triggers, two parameter-create hint triggers and no horizontal overflow in checked states.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Initial evidence identified a P2 density and hierarchy issue: secondary explanations were always visible under controls, adding noise and vertical height even when users did not need them.
2. The shared `FormField` foundation moved hints into label-adjacent information triggers, added portal-based hover/focus tooltips and retained always-available accessible descriptions.
3. Post-fix evidence confirms the default form is compact, tooltip overlays are not clipped, keyboard access works, validation errors remain visible and the pattern applies to the parameter-create screen without local changes.

## Findings

No actionable P0/P1/P2 differences remain for the shared form-hint scope.

final result: passed

---

# Resident create compact horizontal form design QA

- Source visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-bc83fdb5-5a35-4ac4-acbc-71d4fee1cfe3.png`.
- Source pixels: 1190 × 835, desktop medical registration form, density 1×.
- Implementation target: authenticated `/residents`, “新建居民” dialog open.
- Implementation screenshot: blocked before capture because the isolated preview opened at the local sign-in screen.
- Intended viewport: 1190 × 835 CSS px at 1× density.
- State: source available; implementation code built successfully; authenticated visual state unavailable.

## Intended comparison

The implementation adopts the source's compact horizontal labels, four-column basic-information grid, restrained section titles, low vertical spacing, and dashed repeatable-record containers. RHN's existing green semantic palette, typography, controls, dictionaries, validation and save behavior are intentionally preserved.

## Verification completed

- TypeScript compilation and the production frontend build pass.
- Source changes pass whitespace validation.
- No new image asset, custom icon, font, route or business behavior was introduced.

## Blocker

The implementation cannot yet be judged from browser-rendered evidence because the local preview requires an authenticated session. Fonts, spacing, field alignment, footer visibility and the dynamic “新增” rows still require one authenticated capture at the matched viewport.

final result: blocked

---

# Dictionary category settings design QA

- Source visual truth: `docs/audits/dictionary-category-settings-2026-08-28/02-before-edit.png`.
- Browser-rendered implementation: `docs/audits/dictionary-category-settings-2026-08-28/04-after-polished.png`.
- Responsive implementation: `docs/audits/dictionary-category-settings-2026-08-28/05-after-narrow.png`.
- Combined comparison: `docs/audits/dictionary-category-settings-2026-08-28/06-comparison.png`.
- Source and implementation pixels: 1580 × 900 at matching 1× CSS density; no normalization required.
- State: authenticated `/settings/dictionaries`, category-management dialog open, “基础数据” selected, no data mutation.

## Full-view comparison evidence

The matched comparison shows the same selected category before and after. Previously the left tree selected “基础数据” while the right side remained a blank create form and the 860 px dialog required internal scrolling. The implementation opens the selected category directly, distinguishes scope in every tree row and fits the complete editor and footer in a 1024 × 685 dialog without internal scrolling.

## Focused region comparison evidence

- Tree rows now preserve the category name as the flexible primary label and show scope plus code as muted secondary text, separating the two “未分类” nodes.
- The editor header now combines category name, status, scope, immutable code and related-dictionary count while keeping the lifecycle action on the right.
- The 12-column editor groups identity, hierarchy/sort and explanation/audit fields into three compact rows.
- The full-size implementation makes all controls legible, so a separate focused crop was not required.

## Fidelity surfaces

- Fonts and typography: existing RHN family, weights, label hierarchy and muted metadata treatment are preserved; names remain visually prior to codes.
- Spacing and layout rhythm: existing tokenized gaps, field heights, radii and panel borders are retained. Workspace height drops from 730 px to about 460 px and the dialog no longer scrolls on desktop.
- Colors and visual tokens: selection, status, disabled/read-only controls, danger lifecycle action and primary save action use existing semantic tokens. The final pass restores white danger-button text after a scoped selector correction.
- Image quality and asset fidelity: no raster content is present; existing Tabler tree, search, add, edit and close icons are retained.
- Copy and content: search now states that name, code and scope are searchable; placeholders clarify classification boundaries and audit reasons without changing business semantics.

## Interaction, accessibility and responsive checks

- Opening “管理分类” selects the first available category and enters edit mode.
- Selecting the tenant “未分类” updates the editor to `UNCATEGORIZED`, “租户私有” and the correct save action.
- Clicking “新增节点” from that selection clears identity fields, inherits “租户私有”, preselects “未分类” as parent and changes the action to “创建分类”.
- Searching “租户私有” keeps the matching node and its root path; clearing restores the tree.
- At 720 × 900 the workspace becomes one column, sticky actions remain visible and the document, dialog and form have no horizontal overflow.
- ego-lite reported no console or runtime error events. UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Initial evidence identified a P1 interaction mismatch: selecting a tree node did not update the editor. It also found P2 ambiguity between same-name cross-scope nodes and P2 desktop height/clipping.
2. The first implementation enabled selection-driven editing, added scope-aware secondary labels, compacted the form and surfaced category metadata. Visual inspection then found two P2 regressions: the sort input exceeded the editor edge and a broad header span selector reduced danger-button label contrast.
3. Field minimum width and selector scope were corrected. Post-fix evidence confirms zero horizontal overflow, the sort control stays inside the editor, danger text is white and the complete desktop dialog remains visible without scrolling.

## Findings

No actionable P0/P1/P2 differences remain for the dictionary-category settings scope.

final result: passed

---

# Parameter annotation fixes design QA

- Source visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-cd7dfe96-c655-44f2-83e0-8cca44024d3e.png`
- Browser-rendered implementation: `docs/audits/parameter-annotation-fixes-2026-08-27/03-after-matched.png`
- Normalized implementation region: `docs/audits/parameter-annotation-fixes-2026-08-27/04-after-normalized.png`
- Combined comparison: `docs/audits/parameter-annotation-fixes-2026-08-27/05-comparison.png`
- Source pixels: 1551 × 899, annotated desktop content-region capture, density 1×.
- Implementation pixels: 2560 × 1196, desktop CSS viewport, density 1×.
- Normalization: the implementation was cropped to the same 1551 × 899 content-region size as the source so the annotated controls can be judged together without browser navigation or unrelated canvas space.
- State: authenticated `/settings/parameters`, “消息浮窗停留时间” selected, no dialog open, no data mutation.

## Full-view comparison evidence

The combined comparison places the annotated source on the left and the revised browser render on the right. The page hierarchy, content, spacing system, panel proportions, typography and empty state remain unchanged. Only the three annotated component behaviors changed: page actions, strategy badges and the current-value action label.

## Focused region comparison evidence

- Page actions: source buttons touch and measure 82 × 40 px versus 102 × 40 px. The implementation measures both at 120 × 40 px with an 8 px gap and aligned top/bottom edges.
- Strategy badges: source badges are forced to `display: block` by an overly broad span rule. The implementation restores `display: flex; align-items: center`, preserves the 24 px badge height and vertically centers the label.
- Current-value action: source button color is white but the nested label is incorrectly overridden to `rgb(82, 102, 99)`. The implementation resolves both button and label to `rgb(255, 255, 255)` on the brand-green background.

## Fidelity surfaces

- Fonts and typography: existing font family, weights, sizes and line heights are preserved. Button labels remain semibold and no new wrapping appears.
- Spacing and layout rhythm: the two page actions now share a 120 px width, 40 px height and 8 px spacing token. Strategy badges keep their existing horizontal rhythm while gaining correct internal vertical alignment.
- Colors and visual tokens: the primary action uses the existing brand background and inverse white text; success and neutral badge colors now use their semantic component tokens instead of being overwritten by the policy container.
- Image quality and asset fidelity: the affected regions contain no raster assets. Existing icon-library add icon is retained; no custom or placeholder asset was introduced.
- Copy and content: all product copy and business values remain unchanged.

## Findings

No actionable P0/P1/P2 differences remain for the three annotated issues.

## Interaction and responsive checks

- “管理分类”, “新建参数” and “维护当前值” each open the expected dialog; each was cancelled without mutation.
- At 760 px viewport width the page-action group stacks vertically, both controls expand to the same available width, and the page has no horizontal overflow.
- ego-lite event drain reported no console/runtime error or warning events.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Initial evidence confirmed three P2 issues: touching/mismatched page actions, strategy badges losing flex centering, and low-contrast current-value button copy.
2. Fixes added a shared page-header action gap, equal parameter-page action widths, a narrowly scoped policy-copy selector, restored badge flex alignment, and a direct-child selector for toolbar help text.
3. Post-fix browser evidence confirms 120 × 40 px paired actions with 8 px gap, flex-centered badges, white primary-action text, no page overflow and working dialog triggers.

## Follow-up polish

No P3 visual follow-up is required for the annotated scope.

final result: passed

---

# Dictionary create dialog widescreen design QA

- Source visual truth: `docs/audits/dictionary-create-dialog-2026-08-28/01-before.png`.
- Browser-rendered implementation: `docs/audits/dictionary-create-dialog-2026-08-28/02-after-desktop.png`.
- Responsive implementation: `docs/audits/dictionary-create-dialog-2026-08-28/03-after-narrow.png`.
- Combined comparison: `docs/audits/dictionary-create-dialog-2026-08-28/04-comparison.png`.
- Source and implementation pixels: 1580 × 900 at matching 1× CSS density; no normalization required.
- State: authenticated `/settings/dictionaries`, “新建字典” dialog open, no data mutation.

## Full-view comparison evidence

The matched comparison confirms the dialog changed from a 528 × 860 vertical form with an internal scrollbar to an 832 × 562 widescreen form whose complete contents and action footer are visible at once. Identity, governance and explanation fields now read left-to-right in three compact rows while retaining the existing RHN dialog surface, typography and action placement.

## Focused region comparison evidence

- Dictionary name and immutable code share the first row, with extra width assigned to the longer code field.
- Scope and category share the second row, with category receiving the larger searchable-select region.
- Purpose and audit reason share the final row as equal-height multiline controls; guidance remains directly attached to the reason field.
- A focused crop was not required because every label, control, hint and action is legible in the full-size desktop comparison.

## Fidelity surfaces

- Fonts and typography: existing project font family, weights, label hierarchy, muted help copy and required markers are preserved without truncation.
- Spacing and layout rhythm: the project 12-column grid and tokenized 12/16 px gaps create three aligned field rows; the footer is fully visible and the desktop dialog has no internal scroll.
- Colors and visual tokens: existing surface, border, focus, required and primary-action tokens remain unchanged.
- Image quality and asset fidelity: the form contains no raster assets; existing icon-library close and select indicators are retained.
- Copy and content: existing business semantics are preserved. New placeholders clarify the purpose and optional audit-reason inputs.

## Interaction, accessibility and responsive checks

- Opening “新建字典” now produces empty name, code, purpose and reason values instead of copying the currently selected dictionary.
- Empty submission keeps the dialog open and exposes “请输入字典名称” and “请输入字典编码” through invalid form controls.
- At 720 × 900 all six fields reflow to one column, the dialog has no horizontal overflow and the action footer remains reachable.
- Escape closes the dialog. No console or runtime error events were observed in ego-lite.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Initial evidence identified a P1 desktop layout problem: the narrow 528 px dialog consumed nearly the full 900 px viewport height, required scrolling and partially hid the footer. It also exposed a P1 state-isolation defect by prefilling a create form from the selected dictionary.
2. The dialog moved to the shared wide size, fields were grouped by task importance in a responsive 12-column grid, and create mode was isolated from edit-mode source data.
3. Final desktop and narrow captures confirm the full desktop form is visible without scrolling, create fields are empty, validation remains functional and responsive layout has no horizontal overflow.

## Findings

No actionable P0/P1/P2 differences remain for the requested dictionary-create dialog scope.

final result: passed

---

# Disabled button contrast design QA

- Source visual truth: `docs/audits/disabled-button-contrast-2026-08-28/source.png`.
- Browser-rendered implementation: `docs/audits/disabled-button-contrast-2026-08-28/implementation.png`.
- Full-view comparison: `docs/audits/disabled-button-contrast-2026-08-28/comparison.png`.
- Focused button comparison: `docs/audits/disabled-button-contrast-2026-08-28/focused-comparison.png`.
- Responsive evidence: `docs/audits/disabled-button-contrast-2026-08-28/responsive-760.png`.
- Viewport: 1580 × 900 CSS px at density 1× for the matched desktop comparison; 760 × 1000 CSS px for the responsive check.
- Source and implementation pixels: 1580 × 900 each, with no density normalization required.
- State: authenticated `/settings/organization`, “人员任职” selected, “新增任职” rendered in its disabled state.

## Comparison evidence

The focused side-by-side comparison confirms the reported defect and the correction. The source uses a dark green primary surface whose label becomes dark and hard to distinguish after whole-control opacity is applied. The implementation uses the shared disabled-button treatment: a muted neutral surface, strong border and readable secondary text. The button remains unmistakably disabled without sacrificing label clarity.

## Fidelity surfaces

- Fonts and typography: the existing project font family, 12 px semibold button label, line height and control sizing are unchanged; the label no longer loses optical weight through inherited opacity.
- Spacing and layout rhythm: button height, padding, radius, spacing to “维护岗位” and section alignment are unchanged.
- Colors and visual tokens: the disabled state now uses `--color-text-secondary`, `--color-surface-muted` and `--color-border-strong`; measured foreground/background contrast is approximately 5.46:1. Enabled primary and secondary variants retain their original tokens.
- Image quality and asset fidelity: the screen contains no affected raster or custom image assets; no icon or asset substitution was made.
- Copy and content: “新增任职” and all surrounding copy remain unchanged.

## Interaction, accessibility and responsive checks

- The actual disabled state reports `disabled=true`, neutral disabled colors and opacity 1.
- The enabled “新增人员” primary action remains white on brand green; the enabled “维护岗位” secondary action remains dark text on white.
- Disabled controls remain non-interactive and retain the not-allowed cursor behavior from the shared base style.
- At 760 × 1000 the page reports no horizontal overflow and the three button variants remain visually distinct.
- ego-lite reported no console or runtime errors during the checked states.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Source evidence identified a P1 readability issue caused by applying 58% opacity to the entire disabled primary button.
2. The shared component styling was changed to explicit variant-aware disabled colors with full opacity.
3. The matched-state recapture measured approximately 5.46:1 contrast and confirmed that enabled primary and secondary buttons did not regress.

## Findings

No actionable P0/P1/P2 differences remain for the reported disabled-button readability issue.

final result: passed

---

# Parameter annotated refinements design QA

- Source visual truth: `docs/audits/parameter-annotated-refinements-2026-08-27/source-annotated.png`.
- Browser-rendered implementation: `docs/audits/parameter-annotated-refinements-2026-08-27/implementation.png`.
- Expanded validation state: `docs/audits/parameter-annotated-refinements-2026-08-27/validation-expanded.png`.
- Responsive implementation: `docs/audits/parameter-annotated-refinements-2026-08-27/responsive-760.png`.
- Combined comparison: `docs/audits/parameter-annotated-refinements-2026-08-27/comparison.png`.
- Source pixels: 1022 × 1166, annotated desktop dialog capture, density 1×.
- Implementation pixels: 1022 × 1166, matching CSS viewport and density 1×.
- State: authenticated `/settings/parameters`, “新建参数” dialog open, string value type, no data mutation.

## Full-view comparison evidence

The combined side-by-side evidence confirms all three annotations are reflected without redesigning adjacent surfaces. “用途说明” now follows the compact parameter-property row as a single-line control, validation is summarized in a collapsed section by default, and activation scope is represented by a single “参数级别” select. The implementation also reduces the dialog's above-the-fold height while preserving the existing wide RHN modal proportions and sticky action footer.

## Focused region comparison evidence

- Basic information: identity fields remain first; value type, interface control, configuration property and default value share one aligned row; the single-line usage field follows them at full width.
- Validation: the closed state exposes the active rule type and a readable summary, plus an explicit “展开配置” control. Expanding reveals the existing visual rule editor without losing entered values.
- Activation policy: the former eight-checkbox scope fieldset is replaced by one searchable project select labelled “参数级别”. The API-compatible payload remains a one-element scope array.
- Responsive state: at 760 × 1000 all fields stack to one column, the sticky footer remains reachable and neither the document nor dialog overflows horizontally.

## Fidelity surfaces

- Fonts and typography: project font family, label weight, control text, muted help copy and hierarchy remain unchanged; no labels truncate in the matched viewport.
- Spacing and layout rhythm: the existing 12-column grid and tokenized gaps are retained. The requested one-line usage field and collapsed validation state shorten the dialog without compressing controls.
- Colors and visual tokens: surfaces, borders, focus states, required markers and actions use the existing RHN semantic tokens.
- Image quality and asset fidelity: the affected form contains no raster or illustrative assets; existing icon-library close and select indicators are preserved.
- Copy and content: “参数级别” consistently replaces “允许作用域” in the definition interface; validation summary and expand/collapse copy state the interaction clearly.

## Interaction and accessibility checks

- ego-lite confirmed validation starts with `aria-expanded="false"`; the rule inputs are absent until “展开配置” is activated.
- Selecting “平台” from the parameter-level dropdown updates the single value and exposes all eight supported levels through the shared searchable select.
- The edit dialog reuses the same single-select control, maps legacy multi-scope data to its first level for editing, retains the existing purpose text and remains collapsed by default.
- Invalid validation (`最小长度 10`, `最大长度 5`) automatically reopens the section on submit and exposes “最小长度不能大于最大长度”.
- The purpose field is an `input`, appears after the four compact property controls and measures one standard field row.
- At 760 × 1000, document and dialog horizontal overflow checks are both false.
- ego-lite captured no runtime or unhandled-promise errors during the responsive interaction pass.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. The source annotated three P2 usability problems: an oversized/misplaced purpose field, permanently expanded validation rules and a multi-checkbox scope selector for a single-level concept.
2. The implementation moved and compacted the purpose field, added a stateful collapsed validation summary with error-driven auto-expansion, and replaced the scope fieldset with one parameter-level select.
3. Final matched-viewport and responsive comparisons confirm the requested hierarchy, reduced vertical density, working interactions, preserved visual system and no overflow.

## Findings

No actionable P0/P1/P2 differences remain for the annotated scope.

## Follow-up polish

No P3 visual follow-up is required for this iteration.

final result: passed

---

# Parameter basic section refinement design QA

- Source visual truth: `docs/audits/parameter-basic-section-2026-08-27/source-annotated.png`.
- Browser-rendered implementation, matching secret-reference state: `docs/audits/parameter-basic-section-2026-08-27/implementation-secret.png`.
- Standard string state: `docs/audits/parameter-basic-section-2026-08-27/implementation-string.png`.
- JSON state: `docs/audits/parameter-basic-section-2026-08-27/implementation-json.png`.
- Responsive state: `docs/audits/parameter-basic-section-2026-08-27/responsive-760.png`.
- Combined comparison: `docs/audits/parameter-basic-section-2026-08-27/comparison.png`.
- Source and implementation pixels: 1064 × 844, matching CSS viewport, density 1×.
- State: authenticated `/settings/parameters`, “新建参数” dialog open, string value type with secret-reference control, no data mutation.

## Full-view comparison evidence

The combined comparison places the annotated source on the left and the revised secret-reference state on the right at matching dimensions. The affected basic-information region now has a clear two-tier hierarchy: the long-form usage description owns its row, while value type, UI control, configuration category and default-value behavior form one aligned metadata row. Surrounding layout, typography, section styling and validation content remain unchanged.

## Focused region comparison evidence

- The source compressed the usage textarea beside three selects and then stretched a single default-value input across the full row. The implementation gives the semantic description full reading width and aligns four compact configuration fields evenly below it.
- In the source, selecting “密钥引用” still exposed an editable plaintext default. The implementation automatically applies secret sensitivity and hidden display policy, clears the plaintext value, disables incompatible type/control changes and replaces the input with an explicit read-only “不适用于密钥引用” state.
- Standard string and number-like controls keep a compact quarter-width default field; JSON keeps a full-width multiline default editor; dictionary selection expands its required binding-code field on a dedicated row.

## Fidelity surfaces

- Fonts and typography: existing RHN type scale, semibold labels, body input text and muted guidance remain unchanged; the secret note uses the same field hierarchy.
- Spacing and layout rhythm: the basic section preserves the 12-column grid and tokenized 16 px gaps. Long-form content and compact metadata are no longer forced into the same row.
- Colors and visual tokens: borders, surfaces, read-only treatment, required markers and actions continue to use existing semantic tokens.
- Image quality and asset fidelity: the affected form region contains no raster or custom visual assets; existing select indicators and dialog controls are retained.
- Copy and content: type-specific default guidance is preserved. Secret-reference copy now accurately describes storage behavior and removes the misleading plaintext placeholder.

## Interaction, accessibility and responsive checks

- Selecting “密钥引用” automatically changed sensitivity to “密钥” and display policy to “隐藏”; plaintext default content disappeared.
- Switching to JSON selected the JSON editor and expanded its default value to a full-width multiline field.
- Selecting “字典选择” displayed the required dictionary-code field while retaining the normal default-value field.
- At 760 × 900, the document, dialog and form report no horizontal overflow and fields stack into a single readable column.
- Required labels and the read-only secret state remain present in ego-lite's accessibility snapshot.
- ego-lite event output contained no console or runtime errors during these checks.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. Initial evidence showed a P2 hierarchy issue from mixing a long textarea with three compact selects, plus a P1 semantic issue where secret-reference parameters still offered a plaintext default-value input.
2. The region was regrouped by field type, and secret-reference selection was coupled to its required security policy with an explicit non-applicable default state.
3. Final matched-state comparison and alternate string/JSON captures confirm aligned controls, correct conditional fields, readable copy and no responsive overflow.

## Findings

No actionable P0/P1/P2 differences remain for the annotated region.

## Follow-up polish

No P3 visual follow-up is required for this iteration.

final result: passed

---

# Parameter definition form hierarchy design QA

- Source visual truth: `docs/audits/parameter-form-layout-2026-08-27/source-annotated.png`.
- Browser-rendered implementation: `docs/audits/parameter-form-layout-2026-08-27/implementation.png`.
- Lower-form implementation: `docs/audits/parameter-form-layout-2026-08-27/implementation-bottom.png`.
- Responsive implementation: `docs/audits/parameter-form-layout-2026-08-27/responsive-760.png`.
- Combined comparison: `docs/audits/parameter-form-layout-2026-08-27/comparison.png`.
- Source pixels: 1008 × 1026, annotated desktop dialog capture, density 1×.
- Implementation pixels: 1008 × 1026, matching CSS viewport and density 1×.
- State: authenticated `/settings/parameters`, “新建参数” dialog open, string value type, no data mutation.

## Full-view comparison evidence

The combined comparison places the annotated source and the revised browser render at the same pixel dimensions. The implementation preserves the project typography, green semantic palette, modal proportions, control heights, radii and section surfaces while applying the requested hierarchy changes: parameter attributes are integrated into basic information, the default value follows them, and validation and activation policy now form a top-to-bottom reading flow instead of two competing columns.

## Focused region comparison evidence

- Basic information: parameter identity remains the first row; usage description and the three closely related input attributes share the second row; the default value receives a dedicated full-width row. The redundant “参数属性” nested panel is removed.
- Validation: the raw JSON Schema textarea is replaced by visible controls that change with the declared value type. String supports length, regular expression and enumerated values; number supports numeric kind, range and enumerated values; boolean explains its fixed validation; JSON supports object/array shape and object required fields.
- Activation policy: scope selection, sensitivity/display controls and inheritance/cache/null behavior follow validation vertically. The lower screenshot confirms the entire section and persistent footer are visible without clipping.
- Compactness: the three behavior cards use a title-and-description stack so long technical copy no longer wraps into narrow single-word columns.

## Fidelity surfaces

- Fonts and typography: existing project font family, hierarchy, weights, line heights and muted help-text treatment are retained. Labels stay semibold and no important field name truncates.
- Spacing and layout rhythm: the dialog keeps the existing 16 px section rhythm, 12-column basic grid and tokenized control gaps. Main sections are now sequential, and related controls remain aligned within each row.
- Colors and visual tokens: all surfaces, borders, focus states, danger-required markers and primary actions use existing RHN tokens; no new ad-hoc palette was introduced.
- Image quality and asset fidelity: this form contains no raster content or custom illustrative assets. Existing icon-library close and select indicators remain unchanged.
- Copy and content: technical “JSON Schema” maintenance is removed from the field label and retained only in explanatory copy that tells administrators it is no longer necessary to write it manually. Default-value guidance is type-specific.

## Interaction, accessibility and responsive checks

- Switching value type from string to number automatically changed the input control, default-value control and visible validation fields.
- Switching to JSON automatically selected the JSON editor and exposed object/array validation, including object required fields.
- Existing advanced schema keys that are not represented by the visual editor are preserved when an existing definition is saved.
- Required names, legends and form semantics remain exposed in ego-lite's accessibility snapshot.
- At 760 × 900, the dialog, form and document report no horizontal overflow; fields stack to a single readable column and the sticky action footer remains available.
- ego-lite reported no console or runtime errors during the checked interactions.
- UI standards check, TypeScript compilation and production build pass.

## Comparison history

1. The source showed two P1 usability issues: competing left/right section flow and direct JSON Schema string maintenance. It also annotated the parameter-property panel and misplaced default value as hierarchy problems.
2. The first implementation moved the sections and introduced the visual rule editor. Bottom-state inspection found a P2 copy-wrapping issue in the three behavior cards.
3. The behavior cards were changed to stacked title/description layout. Final matched-viewport and lower-form captures confirm readable copy, complete policy controls, a visible sticky footer and no clipping or horizontal overflow.

## Findings

No actionable P0/P1/P2 differences remain for the annotated scope.

## Follow-up polish

No P3 visual follow-up is required for this iteration.

final result: passed

---

# Parameter tree panel design QA

- Source visual truth: `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-f9062985-bee8-4838-b101-84e790a46359.png` and `/var/folders/tq/31b1_m3x7934pqwkcfc3qhcc0000gp/T/codex-clipboard-c55b050a-2b02-41c0-aad2-f6573106d71d.png`.
- Browser-rendered implementation: `docs/audits/parameter-tree-panel-2026-08-27/after-sort-mode-clean.png`.
- Focused implementation region: `docs/audits/parameter-tree-panel-2026-08-27/after-tree-panel.png`.
- Combined comparison: `docs/audits/parameter-tree-panel-2026-08-27/reference-vs-implementation.png`.
- Source pixels: 410 × 827, narrow desktop tree panel capture, density 1×.
- Implementation pixels: 2560 × 1196 desktop viewport, density 1×; focused comparison region 430 × 560.
- State: authenticated `/settings/parameters`, “参数分类管理” open, “平台底座” selected, sort mode enabled, seeded six-node category tree, no net data mutation.

## Comparison evidence

The combined comparison places the draggable source panel on the left and the RHN implementation on the right. Both preserve the same task hierarchy: titled toolbar, search, synthetic root, expandable folders, indented leaves, selected parent row and per-node drag affordances. The implementation intentionally uses the project green semantic palette, tokenized radii and denser wide-dialog proportions instead of copying the source blue styling.

## Fidelity surfaces

- Information hierarchy: title and actions are isolated above search; the tree body owns scrolling and preserves the root-to-leaf reading order.
- Selection and hierarchy: the selected parent receives a full-width soft brand surface, parents use folder icons, leaves use document icons, and every branch has a dedicated expand control.
- Text priority: node names keep the flexible primary width; codes sit at the right in muted monospace text and do not force the name to truncate first.
- Sorting state: the sort action has an explicit pressed state, every movable row exposes a drag handle, and a short keyboard hint appears without shifting the dialog footer.
- Product semantics: the shared component supports an optional delete callback, but parameter categories use active/inactive lifecycle semantics and existing parameter references. The parameter adapter therefore does not present an unsafe hard-delete action; status remains editable in the right-hand form.

## Interaction and accessibility checks

- Searching `PLATFORM_IDENTITY` retained the matching leaf and its parent path; clearing restored all six nodes.
- Selecting “平台底座” enabled edit and loaded the correct immutable code, description, parent and status.
- A physical ego-lite drag moved “界面安全” before “消息提醒”, persisted through the batch reorder endpoint, and a second drag restored the original order.
- Arrow Down moved keyboard focus from “平台底座” to “身份与访问” without changing selection, confirming roving focus behavior.
- The rendered tree exposes one `tree` and seven `treeitem` nodes with level, selected and expanded states; dialog focus remains constrained.
- At 2560 × 1196 the dialog and tree report no horizontal page overflow. ego-lite event drain returned no console or runtime events.

## Engineering checks

- Frontend UI standards check, TypeScript compilation and production build pass.
- Full backend test suite passes, including a new transactional reorder test that covers cross-parent movement and cycle rejection.
- OpenAPI contract and generated frontend types were refreshed from the implemented backend.

## Findings

No actionable P0/P1/P2 visual, interaction or persistence differences remain for the requested tree-panel scope.

final result: passed
