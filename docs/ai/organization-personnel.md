# 组织、人员与科室业务配置

## 数据职责与运行关系

| 配置 | 回答的问题 | 基数与维护方式 | 当前运行中的作用 |
| --- | --- | --- | --- |
| 法定机构、科室层级 | 谁负责、隶属哪里 | 科室属于一个法定机构，可嵌套下级科室 | 租户、机构和科室的数据范围及工作上下文 |
| 科室业务属性 | 科室主要承担什么职责 | 每科室一个，引用 DEPT_PROPERTY | 临床属性参与门诊排班/转科识别，护理属性参与护理单元识别 |
| 具体科室类型 | 哪个专业或具体业务单元 | 每科室一个，引用 DEPT_TYPE | 检验/检查默认执行路由、药库/药房库存场所识别等 |
| 服务能力 | 声明能够提供哪些服务 | 多条能力档案，分别维护范围、依据、有效期、确认结果 | 当前作为能力登记；不自动授予业务操作权限，不替代业务配置 |
| 聘用与科室任职 | 人员在哪个机构/科室担任什么岗位 | 人员→聘用→任职，均保留有效期；可跨科室任职 | 人员归属与工作上下文的基础依据 |
| 账号、角色、业务配置 | 谁能在何范围执行什么操作 | 账号与按科室授权在人员档案维护，角色权限在「角色与权限」维护，科室可设默认角色 | 权限及具体业务条件由各模块继续校验 |

业务属性为主要职责，不应被扩展成一串权限开关。一个临床科室可以登记门诊、住院、手术等多个能力；机构登记了某项能力，并不表示所有下属科室自动具备该能力。能力记录状态 ACTIVE 与确认结果 VERIFIED（符合）是两个维度，仍需结合有效期；登记结果符合也不代表业务已经配置或账号已经授权。

## 当前可验证的运行规则

- 门诊排班与院内转科读取 CLINICAL 业务属性；还需有效科室、人员任职、排班及权限等业务条件。能力勾选不改变该规则。
- 住院护理识别 NURSING 属性；仍需病区、护理单元和授权配置。
- 药学部可使用 PHARMACY 属性和 MED_PHARMACY 类型。只有药库、门诊药房、住院药房、急诊药房、中药房、制剂室六个明确类型参与库存场所同步；药学部本身不会仅因能力登记产生库存场所。旧的医技属性仍按具体类型兼容。
- 检验默认执行路由优先项目明确配置；未配置时优先类型 30，再考虑 30.*。检查路由优先对应的已支持专业类型 32.01～32.08，再考虑通用类型 32；32.09～32.11 等类型须明确配置项目执行科室。候选不唯一时不自动选第一项；停用、虚拟、未生效及过期科室被排除。
- 药学、医学工程、耗材后勤、教学科研属性保留其结构语义，不再落入临床科室默认分类。界面类型选项按维护中的字典提供，不根据科室名称猜测。

“运行规则”页返回的是当前分类与运行用途的解释，不是可执行权限清单。后续若将服务能力接入准入门禁，应先明确每项能力的业务责任方、核验依据、历史数据补齐和各模块消费契约，再逐项接入；不得用未登记能力直接封锁存量业务。

## 维护闭环

组织详情使用人员与任职、资料维护、运行规则、变更记录四个页签。资料维护在一个三列表单内平铺基本资料、服务能力、机构标识、联系方式、地址、负责人、协作关系；科室不维护机构标识和地址。底部统一保存，基本资料与所有修改项在同一事务中提交，失败整单回滚。历史资料通过统一开关查看，可编辑、填结束日期或作废。确认结果直接维护为未确认、符合或不符合，不经过提交、待核验、审批流程。沿用 ORG_VERIFY_STATUS 及历史编码，PENDING 存量迁为 UNVERIFIED，平台字典停用 PENDING，历史变更快照保留。确认结果与启用/作废状态及有效期分别维护。

内部负责人引用真实任职；外部负责人仅登记姓名，两者互斥。

人员入职一次建立人员、聘用和任职；调岗在一个事务中结束原任职并新增目标任职，原任职结束日为生效日前一天。离职按最后工作日结束聘用及其下仍在继续的任职；存在离职日之后才开始的任职时，须先撤销未来任职。结束日期含当日，不等同作废。主要聘用按重叠有效期唯一；主任职沿用同一聘用、同一科室的重叠有效期约束，允许跨科室任职。

负责人有效期须被所引用任职覆盖。任职变更、调岗或离职将使负责人超出任职有效期时，先结束/作废负责人档案，再办理人员流转。岗位可编辑或停用；有引用后不可改类别，停用后不再接收新任职。

停用机构/科室前展示启用下级、仍在继续或待生效的任职，以及机构未结束聘用数量；存在依赖时后端拒绝停用。人员停用阻止新聘用和任职，实际离职仍须办理聘用结束；科室默认角色随任职自动失效，手工授予的角色与账号停用须另行处理（账号停用尚无界面）。

维护写接口统一复用 IAM.MANAGE。更新使用 expectedRevision 防止覆盖他人修改；人员流转与档案更新同事务追加前后快照、操作账号、时间和原因。历史数据不物理删除。新日志不补造上线前的历史，也不把旧记录创建时间冒充维护时间。

## 执业资质、人员查询与任职

- 执业资质（`RHN_SYS_PRACT_QUALIF`，每人一行）：职称 `PRACT_PROF_TITLE`、执业类别 `PRACT_CATEGORY`、执业/资格证书编码、医保医师编码、普通处方权、麻醉与第一类精神药品处方权、抗菌药物处方级别（复用 `BD_ANTIMICROBIAL_LEVEL`）。麻精处方权和抗菌药物级别须先有普通处方权，数据库检查约束同样保证。没有记录表示“未登记”，不能当作“无处方权”。首次保存 `expectedRevision` 为空，之后必须带当前修订号；变更写入人员变更记录。
- 读契约 `PractitionerQualificationDirectory` 供后续开单/审方校验使用；目前没有模块据此拦截业务，接入前须先补齐存量医生资质并提供开关。
- `GET /api/platform/personnel` 服务端分页（页码从 0 开始，每页 1–200），按关键词（工号/姓名）、机构、科室（含下级科室）、岗位类型、职称、处方权和人员状态筛选；“当前任职”指启用且今天在有效期内的任职，主任职优先。
- `POST /api/platform/practitioners/{id}/assignments` 按机构·科室·岗位新增任职：沿用该人员在目标机构的有效聘用；没有聘用时以任职开始日创建一条（与已有主聘用重叠时为非主聘用）；聘用晚于任职开始日时拒绝。界面不再单独维护聘用。

## 账号、角色与科室默认角色

- 权限模型不变：角色授予登录账号（`RHN_SYS_USER_ROLE_ASSIGN`），按 机构·科室 范围生效，科室范围授权同时决定可选工作上下文。账号通过 `ID_PRACT` 关联人员。
- 管理范围由操作人自己的 `IAM.MANAGE` 授权决定：租户级授权或 ROLE_ADMIN 可管全院，机构级授权可管本机构，科室级授权只管当前工作科室。人员须在范围内有未结束任职，授权范围须落在管理范围内；授予的角色不能含操作人不具备的权限。
- 人员档案「账号与角色」：开通账号（账号默认工号，初始密码 bcrypt 存储，8–64 位且含字母和数字），查看/添加/撤销角色。`GET/POST /api/platform/iam/practitioners/{id}/access|account`。
- 账号生命周期（同一分区，管理范围同上）：停用/启用账号 `PUT /api/platform/iam/users/{id}/status`、管理员重置密码 `POST /api/platform/iam/users/{id}/password-reset`，均以账号 `revision`（`expectedRevision`）做乐观锁，并写 `RHN_AUD_IAM_AUTH_EVT`（`ACCOUNT_DISABLED`/`ACCOUNT_ENABLED` 记账号与原因，`PASSWORD_RESET` 只记账号）。新密码规则同开通账号；不能停用当前登录账号，人员档案停用时不能启用其账号。停用账号不撤销角色授权，重新启用即按现有授权恢复。
- 会话失效：HTTP Basic 与续期登录每次请求都只接受 `ACTIVE` 账号（`IdentityAccessDirectory.findActiveAccount`），停用即无法再认证；停用和重置密码在事务提交后经 `PresenceService.terminateAccountSessions` 吊销该账号在线客户端会话（`SessionRevocationStore`，由 `ClientSessionRevocationFilter` 拦截）、删除续期登录并推送下线指令。
- 办理离职弹窗在账号仍启用时提供「同时停用登录账号」（离开最后一个聘用机构时默认开启），先停用账号再结束聘用，避免补录过去日期的离职后超出科室管理范围而无法停用。
- 科室默认角色（`RHN_SYS_DEPT_DFLT_ROLE`）：在「机构与科室」科室详情维护，`GET/PUT /api/platform/iam/departments/{id}/default-roles`。已开通账号的人员在该科室有任职时（入职、新增任职、调岗、开通账号、或保存默认角色时选择“同时授予现有人员”）自动授予，授权记录 `SD_GRANT_SRC = DEPT_DEFAULT` 并关联任职 `ID_STAFF_ASSIGN`，有效期从任职开始日（不早于当前时刻）到任职结束日次日零点。任职结束、调岗、离职或作废时同步收短；不会自动延长，被手工撤销后同一任职不再补授；移除默认角色不撤销已授予记录。同步通过 `organization/api/StaffAssignmentSynchronizer` 在人员流转同一事务中执行。
- 「角色与权限」页按角色反查已授权人员（`GET /api/platform/iam/roles/{id}/members`，可含已失效），并可授予当前工作科室或撤销。

## 代码与验证入口

- 前端：「机构与科室」`/settings/organizations` 在 features/settings/organizations/（OrganizationsPage 只读详情 + 编辑/分区维护/停用弹窗，样式 styles/features/organizations.css）；「人员管理」`/settings/personnel` 在 features/settings/personnel/（PersonnelPage 服务端分页列表，PersonnelDrawer 档案抽屉含任职与执业资质，入职/调岗/结束任职/离职/岗位设置弹窗，样式 styles/features/personnel.css；支持 `?departmentId=` / `?organizationId=` 预置筛选）。两个页面共用的回执与字典校验、档案表单和变更记录留在 features/settings/ 根目录（organization*Facts/Receipt、organizationProfileForm.ts、OrganizationProfileRecords.tsx、OrganizationChangeHistory.tsx、practitionerOnboarding.ts）。旧路径 `/settings/organization` 重定向到机构与科室；两个菜单共用 ORGANIZATION 模块与 ORGANIZATION.ACCESS。
- 后端：rhn-platform 的 organization/application、organization/web/OrganizationMaintenanceController、PersonnelController（人员查询、执业资质、任职）；运行解释见 organization/api/DepartmentBusinessPolicy。
- 账号与授权：前端 features/settings/access/（人员档案分区、科室默认角色分区、授予/撤销/开通/停用启用/重置密码弹窗）与 AccessControlManagement.tsx；后端 rhn-platform 的 identityaccess/application（IdentityAccessAdministrationService、DepartmentDefaultRoleService、ManagementScopes、RoleGrantStore），账号会话失效复用 realtime/application/PresenceService；集成测试 DepartmentDefaultRoleTest、AccountLifecycleTest。
- 运行消费者：ServiceExecutionDepartmentPolicy、PharmacyDepartmentExtensionSynchronizer；变更分类规则时验证其消费者。
- 验证：`./scripts/verify-scope.sh organization`；契约、权限和迁移变化扩大验证，迁移另执行 `npm --prefix frontend run schema:refresh -- --source expected`、`npm --prefix frontend run schema:check`。
- 人工验收：1280/1440/1920px 下的树展开搜索、完整详情宽度、弹窗与列表滚动；调岗、结束任职、离职、内部负责人交接、资料作废/结束和过期版本冲突。DOM 测试不证明视觉或已部署版本正确。
