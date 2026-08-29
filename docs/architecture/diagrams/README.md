# RHN 架构图

本目录包含当前项目的三张架构图，内容基于项目代码、模块边界、技术依赖、建设路线图与数据库迁移整理。

| 图 | PNG | 可编辑源图 |
| --- | --- | --- |
| 整体架构图 | `01-rhn-overall-architecture.png` | `01-rhn-overall-architecture.svg` |
| 技术架构图 | `02-rhn-technical-architecture.png` | `02-rhn-technical-architecture.svg` |
| 业务架构图 | `03-rhn-business-architecture.png` | `03-rhn-business-architecture.svg` |

图片规格为 1920 × 1080，适合评审、方案文档和演示文稿使用。SVG 可在浏览器、Figma、Sketch、Illustrator 等工具中继续编辑。

重新生成 SVG：

```bash
node docs/architecture/diagrams/generate-architecture-diagrams.mjs
```

内容口径：

- 整体架构：角色与入口、核心业务域、共享平台能力、数据与运行基础。
- 技术架构：React 前端、REST/OpenAPI 契约、Java/Spring 模块化单体、持久化与工程治理。
- 业务架构：居民识别、门诊诊疗、检查检验、药事供应、费用医保、医防协同及治理底座。
