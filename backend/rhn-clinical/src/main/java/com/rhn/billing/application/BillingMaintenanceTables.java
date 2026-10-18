package com.rhn.billing.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class BillingMaintenanceTables {
    private BillingMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_BIL_CASHIER_CLOSE", "ID_CASHIER_CLOSE", "BILLING", "收银日结", true),
                new TableDefinition("RHN_BIL_CASHIER_CLOSE_EVT", "ID_CASHIER_CLOSE_EVT", "BILLING", "收银日结事件", true),
                new TableDefinition("RHN_BIL_CASHIER_CLOSE_ITEM", "ID_CASHIER_CLOSE_ITEM", "BILLING", "收银日结项目", true),
                new TableDefinition("RHN_BIL_CASHIER_CLOSE_LINE", "ID_CASHIER_CLOSE_LINE", "BILLING", "收银日结明细", true),
                new TableDefinition("RHN_BIL_CHARGE_ITEM", "ID_CHARGE_ITEM", "BILLING", "收费项目", false),
                new TableDefinition("RHN_BIL_CHARGE_ITEM_COMP", "ID_CHARGE_ITEM_COMP", "BILLING", "收费项目组成", false),
                new TableDefinition("RHN_BIL_INVOICE", "ID_INVOICE", "BILLING", "发票", false),
                new TableDefinition("RHN_BIL_INVOICE_CAT_SUM", "ID_INVOICE_CAT_SUM", "BILLING", "发票分类汇总", false),
                new TableDefinition("RHN_BIL_INVOICE_LINE", "ID_INVOICE_LINE", "BILLING", "发票明细", false),
                new TableDefinition("RHN_BIL_LEDGER_ENTRY", "ID_LEDGER_ENTRY", "BILLING", "台账分录", false),
                new TableDefinition("RHN_BIL_PAT_ACCT", "ID_PAT_ACCT", "BILLING", "患者账户", false),
                new TableDefinition("RHN_BIL_PAY", "ID_PAY", "BILLING", "支付", false),
                new TableDefinition("RHN_BIL_PAY_EVT", "ID_PAY_EVT", "BILLING", "支付事件", false),
                new TableDefinition("RHN_BIL_PAY_ORDER", "ID_PAY_ORDER", "BILLING", "支付医嘱", false),
                new TableDefinition("RHN_BIL_RCPT", "ID_RCPT", "BILLING", "票据", false),
                new TableDefinition("RHN_BIL_RCPT_EVT", "ID_RCPT_EVT", "BILLING", "票据事件", false),
                new TableDefinition("RHN_BIL_RECON_BATCH", "ID_RECON_BATCH", "BILLING", "核对批次", true),
                new TableDefinition("RHN_BIL_RECON_ITEM", "ID_RECON_ITEM", "BILLING", "核对项目", true),
                new TableDefinition("RHN_BIL_RECON_ITEM_EVT", "ID_RECON_ITEM_EVT", "BILLING", "核对项目事件", true),
                new TableDefinition("RHN_BIL_REG_BIL_INTENT", "ID_REG_BIL_INTENT", "BILLING", "挂号计费意图", false),
                new TableDefinition("RHN_BIL_RELIEF_APPLY", "ID_RELIEF_APPLY", "BILLING", "结算减免记录", false),
                new TableDefinition("RHN_BIL_RELIEF_APPLY_LINE", "ID_RELIEF_APPLY_LINE", "BILLING", "结算减免分配明细", false),
                new TableDefinition("RHN_BIL_RELIEF_POLICY", "ID_RELIEF_POLICY", "BILLING", "惠民减免政策", true),
                new TableDefinition("RHN_BIL_RELIEF_POLICY_VER", "ID_POLICY_VER", "BILLING", "惠民减免政策版本", true),
                new TableDefinition("RHN_BIL_RELIEF_QUALIF", "ID_RELIEF_QUALIF", "BILLING", "惠民减免资格条件", true),
                new TableDefinition("RHN_BIL_RELIEF_QUOTA", "ID_RELIEF_QUOTA", "BILLING", "惠民减免额度累计", false),
                new TableDefinition("RHN_BIL_RELIEF_QUOTA_TXN", "ID_QUOTA_TXN", "BILLING", "惠民减免额度流水", false),
                new TableDefinition("RHN_BIL_RELIEF_ROSTER", "ID_RELIEF_ROSTER", "BILLING", "惠民资格名单", true),
                new TableDefinition("RHN_BIL_RELIEF_RULE", "ID_RELIEF_RULE", "BILLING", "惠民减免规则", true),
                new TableDefinition("RHN_BIL_STL", "ID_STL", "BILLING", "结算", false),
                new TableDefinition("RHN_BIL_STL_CAT_SUM", "ID_STL_CAT_SUM", "BILLING", "结算分类汇总", false),
                new TableDefinition("RHN_BIL_STL_EVT", "ID_STL_EVT", "BILLING", "结算事件", false),
                new TableDefinition("RHN_BIL_STL_LINE", "ID_STL_LINE", "BILLING", "结算明细", false),
                new TableDefinition("RHN_BIL_STL_TENDER", "ID_STL_TENDER", "BILLING", "结算收款方式", false),
                new TableDefinition("RHN_INS_CLAIM", "ID_INS_CLAIM", "BILLING", "医保理赔", false),
                new TableDefinition("RHN_INS_CLAIM_LINE", "ID_INS_CLAIM_LINE", "BILLING", "医保理赔明细", false),
                new TableDefinition("RHN_INS_CLAIM_RESP", "ID_CLAIM_RESP", "BILLING", "医保理赔响应", false)
        );
    }
}
