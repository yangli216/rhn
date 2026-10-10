# 药房工作台边界

`PharmacyWorkspace.tsx` 只协调模式。`usePharmacyWorkspace.ts` 统一持有查询、患者选择、扫码队列、接方/配药/发药/退药命令及刷新，避免多个展示面板分别执行库存动作。

- `PharmacyQueryPanel.tsx`：患者、日期、状态筛选与发药查询。
- `PharmacyOperationsPanel.tsx`：审方、退药与病区供药的操作界面。
- `PharmacyDispensingPanel.tsx`：处方核对、扫码状态、发药与患者辅助信息。
- `WardDeliveryQueue.tsx`：病区配送与差异处置。
- `pharmacyShared.ts`：纯搜索/分组/数量展示与状态文案。

展示面板接收协调模型，不独立发药或重新查询患者。F4 键盘监听通过最新回调引用访问当前已勾选处方；相同患者和处方身份的刷新保留药师选择。患者/处方集合变化才初始化勾选；扫码批次仍串行、卸载取消当前定时任务。

发药需有效的数量、药师任职和追溯码；必须使用真实处方/库存资料和已有服务端幂等/版本保护。请勿从界面“成功”推断库存或账务已更新，刷新失败仍提示实际操作可能已完成。查询列表、手动动作和 F4 的组合回归在 `../PharmacyWorkspace.test.tsx`。

验证入口为 `./scripts/verify-scope.sh inventory`，涉及安全核对组合 `medication-safety`，涉及资金组合 `billing`；库存/账务契约和迁移追加完整 CI。
