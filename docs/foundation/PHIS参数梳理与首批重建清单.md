# PHIS 参数梳理与首批重建清单

- 状态：首批已实施
- 盘点日期：2026-08-27
- 目标：从 PHIS 现有参数中提炼可复用语义，按《参数分类与参数定义规范》重建 RHN 参数基线

## 1. 盘点范围

本次对 Oracle `phis` 服务进行了只读识别，重点检查以下数据来源：

| 数据来源 | 现状 | 结论 |
|---|---:|---|
| `PHIS27` | 19 张业务和基础资料表 | 当前抽样模式没有独立系统参数表，不作为本次迁移源 |
| `BBP_DEV_NEW.HI_SYS_PARAM` | 324 条定义，292 条启用 | PHIS 基础门户参数定义的主要盘点来源 |
| `BBP_DEV_NEW.HI_SYS_PARAM_VALDEF` | 791 条当前值定义 | 用于识别旧默认值和覆盖习惯，不直接复制标识 |
| `BBP_DEV_NEW.HI_SYS_PARAM_VALDEF_LIMIT` | 786 条限定关系 | 用于识别旧作用域，不直接复制关系 |
| `BASE_DEV_NEW.C_SY_PARAM_VALUE` | 1,076 条值、379 个参数编码 | 运行值层；与旧定义只有部分编码重合，不作为全量迁移依据 |
| `BASE_DEV_NEW.C_SY_PARAM_LOG` | 3,209 条历史统计值 | 仅用于确认旧系统已有变更留痕，不迁入 RHN 变更日志 |

`BBP_SHOW` 同类定义和值用于交叉核对。开发和展示环境在本次入选参数的默认值上基本一致。

## 2. 旧模型主要问题

1. 参数编码同时存在驼峰、下划线、全大写和无领域前缀，无法稳定判断责任模块。
2. 布尔、数值和复杂规则经常统一保存为字符串，缺少强类型及范围校验。
3. 默认值、值来源、允许作用域和继承策略没有形成一个完整定义契约。
4. 部分接口地址、令牌和密钥曾直接保存在定义默认值中，不符合 RHN 密钥引用规则。
5. 旧作用域包含系统租户、基础数据账户、角色、机构、部门、人员、工作站、个人分类和个人，新旧模型不能全部一一映射。
6. 多个作用域反复保存与默认值相同的数据，增加维护量但没有形成实际差异。
7. 一条正则同时承担密码长度和复杂度规则，可读性、可校验性及后续演进能力不足。

因此本轮采用“语义重建”，不采用旧表到新表的全量复制。

## 3. 作用域映射决策

| PHIS 旧限定类型 | RHN 目标作用域 | 本轮处理 |
|---|---|---|
| 系统租户 | `TENANT` | 可以映射，首批使用产品默认值，暂不复制旧租户覆盖 |
| 机构 | `ORGANIZATION` | 可以映射，需通过新旧机构主数据映射后再迁具体值 |
| 部门 | `DEPARTMENT` | 可以映射，需通过新科室权威表映射后再迁具体值 |
| 人员 | `USER` | 不能直接等同；必须先完成人员与登录账号映射 |
| 角色 | 暂无等价作用域 | 不迁移，后续判断应进入权限策略还是扩展作用域 |
| 工作站 | 暂无等价作用域 | 不迁移，确有需求时单独设计终端上下文 |
| 基础数据账户、个人分类、个人 | 暂无等价作用域 | 不迁移，避免错误继承和越界配置 |

## 4. 初始化分类

遵循“只创建已有实际参数的分类”原则，本轮不预建门诊、住院等空业务目录。

```text
PLATFORM 平台底座
└─ PLATFORM_IDENTITY 身份与访问

PORTAL 工作门户
├─ PORTAL_NAVIGATION 导航与快捷入口
├─ PORTAL_NOTIFICATION 消息提醒
└─ PORTAL_SECURITY 界面安全
```

分类只用于管理目录，不参与运行时解析和权限判断。

## 5. 首批参数重建映射

| PHIS 旧参数 | RHN 参数键 | 默认值 | 允许作用域 | 处理说明 |
|---|---|---:|---|---|
| `pwdSecurityEnable` | `platform.identity.password-policy.enabled` | `true` | 平台、租户 | 保留启用语义，默认开启 |
| `pwdRule` | `platform.identity.password-policy.min-length` | `8` | 平台、租户 | 不复制整条正则，先提炼最小长度；由旧规则 6 位提升为产品基线 8 位 |
| `pwdDurationTime` | `platform.identity.password-policy.expiry-period` | `30 d` | 平台、租户 | 保留旧系统一致使用的 30 天默认值 |
| `pwdExpiredInfoTime` | `platform.identity.password-policy.expiry-warning` | `2 d` | 平台、租户 | 保留旧默认值 |
| `pwdExpiredCount` | `platform.identity.failed-login.max-attempts` | `3` | 平台、租户 | 明确为失败登录阈值，不再使用“密码校验次数”模糊命名 |
| `pwdExpiredTime` | `platform.identity.failed-login.window` | `10 min` | 平台、租户 | 明确为失败次数统计窗口 |
| `pwdForbidTime` | `platform.identity.failed-login.lock-duration` | `30 min` | 平台、租户 | 明确为达到阈值后的锁定时长 |
| `nav_hot_limit` | `portal.navigation.hot-item.limit` | `9` | 平台、租户、用户 | 将旧人员级意图收敛为登录用户偏好 |
| `nav_recent_limit` | `portal.navigation.recent-item.limit` | `9` | 平台、租户、用户 | 将旧人员级意图收敛为登录用户偏好 |
| `msgBoxTimer` | `portal.notification.poll-interval` | `5 min` | 平台、租户、机构、用户 | 保留机构差异，并允许用户体验覆盖 |
| `notifyDuration` | `portal.notification.display-duration` | `3 s` | 平台、租户、机构、用户 | 保留旧默认值并增加范围校验 |
| `watermark` | `portal.security.watermark.enabled` | `false` | 平台、租户、机构 | 水印只作辅助追踪，不作为后端安全边界 |

全部参数均声明为 `SYSTEM`，显式定义值类型、控件、JSON Schema、单位、继承、缓存和展示策略。身份安全参数及水印开关关闭参数缓存，避免业务模块再建立第二级缓存；普通门户体验参数使用底座缓存。

## 6. 本轮明确不迁移的内容

| 类型 | 示例 | 原因 |
|---|---|---|
| 明文密钥和令牌 | CA 密钥、数据库令牌、上报令牌 | 必须先进入密钥服务，参数中心只能保存 `SECRET_REFERENCE` |
| 接口地址集合 | CA、LIS、PACS、医保、报卡等地址 | 需要按外部系统建立集成分类，并明确机构作用域、失败策略和凭据引用 |
| 登录方式开关 | 人脸、证书、快速登录 | 当前 RHN 尚未接入对应认证适配器，提前启用会形成无效配置 |
| 强制审计开关 | 旧扩展日志开关 | 法定或关键审计不能依赖一个可关闭的普通参数 |
| 角色和工作站偏好 | 页面关闭、快捷页等 | 新底座尚无等价作用域，不能用用户作用域冒充 |
| 门诊、住院、药事业务参数 | 挂号效期、处方效期、库存冻结等 | 应在对应业务模块开工时由领域负责人确认语义后分批重建 |

## 7. 落地方式

- H2/PostgreSQL 兼容基线：`db/migration/V14__parameter_classification_and_system_parameter_baseline.sql`
- Oracle 基线：`db/oracle/V14__parameter_classification_and_system_parameter_baseline.sql`
- 基线包含 6 个分类、12 个启用定义和 12 条创建留痕，不写重复的 `parameter_values`；没有覆盖值时直接解析定义默认值。
- 后续租户、机构、科室和用户差异必须通过参数管理功能维护当前值，不能修改迁移脚本或在业务代码中增加隐藏默认值。

## 8. 下一批建议

第二批应随门诊主流程推进，优先确认患者建档、挂号有效期、处方有效期、皮试时长、重复开单校验和 LIS/PACS 接入开关。每个参数在创建前仍需重新确认名称、单位、值域、缺值策略及历史业务采用值，不能仅凭旧编码直接迁移。
