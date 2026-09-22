# Codex + Jev 页面验证试点

分工：Codex 编写目标、动作边界和断言；Jev 选择下一步操作；上游 Browser Harness 在真实 Chrome 中执行；确定性 DOM 断言决定 PASS/FAIL。不是 Codex 官方集成，也不是新的默认浏览器工具。

## 运行

在项目根目录执行：

```bash
bash scripts/verify-jev.sh --test  # 离线检查隐私边界和判定逻辑，不调用模型
bash scripts/verify-jev.sh         # 实际运行，有 TypeSafe API 用量
```

需要 `uv`、Chrome 和运行中的主工作区服务（8080 / 5173，后端 oracle-local）。脚本不会启动、重启或停止这些服务。macOS 默认 Chrome 路径已设置；其他平台通过 `RHN_JEV_CHROME` 指定可执行文件。首次运行安装固定提交 `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` 的 jev-ultrafast，并使用其锁文件。上游源码存于已忽略的 `.runtime/jev-pilot/upstream`；源码修改或版本不符时拒绝运行。

API Key 从环境变量或 `.runtime/jev-pilot/.env` 读取，环境变量优先。文件内容格式如下，文件权限设为 `600`，不要提交真实值：

```dotenv
TYPESAFE_API_KEY=your-key
TYPESAFE_MODEL=jev-latest
```

每次使用独立的临时 Chrome profile、动态本机调试端口和唯一名称的 Harness daemon，结束时关闭本次创建的标签、daemon 和 Chrome 进程；不复用用户浏览器或修改其远程调试配置。报告写入 `.runtime/jev-pilot/*-report.json`。

## 当前场景及实际范围

1. 使用 RHN 登录页面预填的本地演示账号进入工作台（确定性准备步骤，不交给模型）。
2. Jev 根据中文目标打开“搜索模块”，选择输入框，输入用例值“挂号查询”，选择结果。
3. 独立读取活动页面，检查路由、挂号查询标题、关键词输入框和查询按钮，并检查确实执行过输入及结果点击。
4. 四项断言通过即可结束，无需再付费询问 DONE；提前 DONE、BLOCKED、调用失败、预算耗尽都不会冒充通过。

这是**真实页面模块导航冒烟验证**，尚未验证挂号记录正确性、筛选、分页、收费或开方。不会把“暂无记录”作为固定预期。搜索文本由用例确定，未调用文本生成模型，不需要第二个 API Key。它复用了上游 `choose()`、动态操作/目标决策和 `Browser` 过期状态检查，但使用本项目的受限循环而非原版无约束 `Agent.run()`。

模型只收到允许的模块搜索操作、固定搜索词、固定页面标识和布尔验证状态。原始页面正文、患者记录、登录信息、DOM guards 和截图不会进入请求或报告。原始观察只在本地内存里用于执行前检查。动作集合不包含挂号、退号、保存、收费或其他业务按钮。当前场景依赖本地预填演示账号；自定义登录、SSO、MFA 需要另行实现准备步骤。

默认最多 12 次决策（`--max-decisions` 可设 1–30）；每轮前检查 120 秒预算。上游 HTTP 请求自带超时和有限重试，因此这不是精确的整体硬超时。API 重试可能超过决策数，报告中的 token usage 是成功返回的决策响应之和，不能当作完整账单。

## 结果解释与扩展

报告区分 `setup_ms`、`loop_ms`、`total_ms`：循环耗时包含观察、决策、执行和等待；总耗时还包含浏览器启动、登录及清理。每次记录实际模型版本、调用延迟、token usage、成功执行动作、状态过期重试和独立断言。异常只记录类型和代码栈位置，不输出可能带凭据的响应正文。

先在同一场景多次运行评估稳定性。尚无与 ego-browser 的同条件基准，不能据单次结果声称加速比例。固定回归流程仍以现有 Vitest、后端测试和确定性脚本为主；Jev 适合补充自然语言驱动的探索与冒烟。

新增场景时先定义明确的最终断言，再扩展允许的控件、输入与模型投影。需要业务数据校验时，将比对留在本地，不把患者数据加入模型上下文。写操作场景应使用隔离 test profile / 随机 H2 与独立端口。不要直接放开对 Oracle 人工验证库的写操作。现阶段不加入默认 CI。

参考：[上游实现](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)、[TypeSafe API](https://docs.typesafe.ai/api)、[并行问题与分支选择](https://docs.typesafe.ai/patterns/fan-out)。
