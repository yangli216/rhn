# 协作开发与集成

本项目由人和 AI 共同迭代。业务入口从 [模块导航](docs/ai/module-map.md) 选择，服务、测试隔离、桌面布局和 Git 操作遵循根目录与前端的 AGENTS.md。

## 任务隔离

- 新的独立任务使用独立分支与 worktree（默认分支前缀 `codex/`）；同一任务的协作者可以共享该任务工作区。记录基线提交、目标范围和工作区路径，不依赖其他任务的未提交修改。
- 开始时检查现有 worktree 和变更范围，复用属于本任务的工作区。已有主目录任务继续保留；不得为了隔离新任务而 stash、重置、搬走别人的修改或中断其服务。
- worktree 隔离源码和构建产物，不隔离数据库、端口或外部文件。测试使用 `test` profile 与随机 H2 数据库；临时服务使用独立端口。不要在主目录并行构建或生成其他任务的产物。
- 本地修改不自动提交或推送；只有用户明确要求时才执行。

## 共享资产与责任

在任务说明或 PR 中写明开发、集成和复核的负责人或角色。模块目录中的 owner 表示能力归属，不能代替实际的集成责任；不虚构 GitHub 用户或 CODEOWNERS。

| 共享资产 | 集成责任与检查 |
| --- | --- |
| 公共 UI、样式令牌、工作站公共状态 | 指定共享组件维护角色；合并时验证所有受影响消费者，遵循现有页面模板 |
| API / OpenAPI / generated.ts | 指定契约维护角色；服务实现、公开契约与生成类型一起集成，不混入其他任务未完成的接口 |
| 数据库迁移、公共与 Oracle 脚本 | 指定数据集成角色；集成前核对版本号唯一、迁移顺序、跨方言对等变更及目录检查；不得改写已发布迁移 |
| 权限、全局配置、CI、验证脚本 | 指定平台集成角色；按受影响范围扩大验证，保留原有门禁 |

同一共享资产的修改先在任务说明中声明范围，由集成角色安排串行集成；独立任务可并行开发。不增加额外审批层级。迁移编号冲突在集成时处理，开发 profile 的 out-of-order 容错不代表发布顺序正确。

## 验证与交付证据

`./scripts/verify-scope.sh <scope> --list` 显示维护的检查。正式运行会在忽略的 `.runtime/verification/<run>/` 保存阶段日志、`timings.tsv`、`source-before.json` 和 `source-after.json`。需要 Python 3（仅标准库）。

快照记录 worktree、HEAD、分支、UTC 时间和源码 SHA-256，覆盖 Git 跟踪文件（含删除）与未忽略的新文件；不保存源码内容。忽略的构建产物、依赖、日志和本地配置不参与源码指纹。验证前后源码或 HEAD/分支变化时退出码为 `2`，不能宣称某一固定版本通过；阶段失败仍需独立分析，不能直接归因于其他线程。源码稳定但检查失败返回 `1`，稳定且全部通过返回 `0`。

快照只核对端点并尝试稳定采集，无法检测“中途修改后恢复”的情况，也不能覆盖忽略的运行配置或外部数据库，因此仍须隔离工作区。报告测试 profile、依赖环境以及影响结果的本地配置项名称，勿记录密码或令牌。

未使用 scope 的检查也可包裹快照：

```bash
python3 scripts/verification-snapshot.py capture --scope custom --output .runtime/verification/custom/source-before.json
# 运行本次检查，分别保留命令退出码与完整日志
python3 scripts/verification-snapshot.py check --before .runtime/verification/custom/source-before.json --output .runtime/verification/custom/source-after.json
```

基础设施自身的回归入口：`python3 -B -m unittest discover -s scripts/tests -p 'test_development_workflow.py' -v`。scope 不替代完整 CI；契约、迁移、权限、库存、收费和共享基础设施变化扩大验证。CI 使用显式启用 pipefail 的 Bash，写入日志的管道失败必须保持非零退出。

集成角色在目标集成工作区重新检查冲突与组合行为，用集成后的源码快照运行相关检查及完整 CI，不直接复用分支集成前的通过结果。交付记录包含：基线/集成 HEAD、源码指纹、命令与日志路径、验证时间、尚未完成的人工检查。交付构建包时追加包路径与 SHA-256（如 `shasum -a 256 <artifact>`）。

主目录 `8080 / oracle-local` 与 `5173` 为持久人工验收服务。更新运行版本由集成操作统一执行，记录后端运行制品指纹/对应 HEAD 与启动时间；前端热更新时记录当前源码快照和验收时间。已有运行版本无法确认则明确标注未知，HTTP 健康不能证明业务版本一致。普通任务不互相重启服务；交付前检查可达性，恢复服务仍须遵守根 AGENTS 的 profile 与精确进程规则。

GitHub 保护分支和 required checks 属于远程设置；工作流声明不等于已启用合并保护，需由仓库管理者另行核对。
