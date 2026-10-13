package com.rhn.billing.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;

@Component
public class BillingMaintenanceContribution extends ClinicalMaintenanceSupport {
    public BillingMaintenanceContribution() { super("BILLING", BillingMaintenanceTables.all()); }
    @Override public List<Issue> inspect(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules, List<Root> roots) {
        List<Issue> issues = new ArrayList<>();
        for (var payment : rows(snapshot, "RHN_BIL_PAY")) {
            if (present(payment, "CD_EXT_TXN_NO"))
                issues.add(new Issue("MAINTENANCE_EXTERNAL_PAYMENT_BLOCKED", "存在外部支付交易，需通过原支付/退费流程处理", "BILLING"));
        }
        for (var order : rows(snapshot, "RHN_BIL_PAY_ORDER")) {
            if (present(order, "CD_EXT_ORDER_NO"))
                issues.add(new Issue("MAINTENANCE_EXTERNAL_PAYMENT_BLOCKED", "存在已送外部渠道的支付单，不能直接清理", "BILLING"));
        }
        for (var claim : rows(snapshot, "RHN_INS_CLAIM")) {
            if (present(claim, "CD_EXT_PRE_STL_NO") || present(claim, "CD_EXT_STL_NO"))
                issues.add(new Issue("MAINTENANCE_EXTERNAL_INSURANCE_BLOCKED", "存在医保交互；未具备可验证的仿真来源，不能直接清理", "BILLING"));
        }
        for (var receipt : rows(snapshot, "RHN_BIL_RCPT")) {
            if (present(receipt, "CD_EXT_RCPT_NO") || present(receipt, "CD_FISCAL_NUMBER"))
                issues.add(new Issue("MAINTENANCE_EXTERNAL_RECEIPT_BLOCKED", "存在财政票据；未具备可验证的仿真来源，不能直接清理", "BILLING"));
        }
        if (modules.contains("BILLING")
                && (!rows(snapshot, "RHN_BIL_CASHIER_CLOSE_ITEM").isEmpty() || !rows(snapshot, "RHN_BIL_RECON_ITEM").isEmpty()))
            issues.add(new Issue("MAINTENANCE_CLOSED_FINANCIAL_FACTS", "业务已进入结账或对账，需按原流程处理", "BILLING"));
        if (modules.contains("BILLING") && !modules.contains("OUTPATIENT") && snapshot.tables().stream().anyMatch(table ->
                "BILLING".equals(table.definition().module()) && !table.definition().retained() && !table.rows().isEmpty()))
            issues.add(new Issue("MAINTENANCE_OUTPATIENT_RESET_REQUIRED", "清理该就诊收费还需处理门诊根业务，避免迟到事件重新计费", "OUTPATIENT"));
        return issues.stream().distinct().toList();
    }
    private boolean present(Row row, String column) {
        String value = text(row, column); return value != null && !value.isBlank();
    }
}
