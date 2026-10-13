package com.rhn.outpatient;

import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberScope;
import org.springframework.stereotype.Component;
import java.util.Set;

/** Institution-unique document contracts permit independent institution sequences, but not department counters. */
@Component
public class OutpatientBusinessNumberingPolicy {
    public OutpatientBusinessNumberingPolicy(BusinessNumberGenerator numbers) {
        validate(numbers);
    }

    public static void validate(BusinessNumberGenerator numbers) {
        var documentRules = Set.of("outpatient-encounter", "outpatient-appointment", "outpatient-registration",
                "outpatient-triage", "outpatient-referral", "service-request", "prescription",
                "schedule-resource", "schedule-template", "schedule", "pharmacy-return", "invoice",
                "payment-order", "refund-order", "payment", "refund", "receipt", "insurance-claim",
                "cashier-close", "cashier-reopen", "reconciliation-batch",
                "resident-record", "inpatient-episode", "inpatient-encounter", "inpatient-deposit",
                "stock-purchase-order", "stock-goods-receipt", "stock-transfer", "stock-requisition",
                "stock-count", "stock-price-adjustment", "stock-period-close", "stock-reconciliation",
                "medication-supply-batch", "ward-delivery", "ward-medication-return");
        for (String code : documentRules) {
            var rule = numbers.rules().get(code);
            if (rule == null) throw new IllegalArgumentException("Missing outpatient business numbering rule: " + code);
            if (Set.of("resident-record", "payment-order", "refund-order", "outpatient-referral").contains(code)
                    && rule.scope() != BusinessNumberScope.TENANT && rule.scope() != BusinessNumberScope.SYSTEM) {
                throw new IllegalArgumentException("Cross-institution document requires tenant scope: " + code);
            }
            if (rule.scope() != BusinessNumberScope.SYSTEM && rule.scope() != BusinessNumberScope.TENANT && rule.scope() != BusinessNumberScope.ORGANIZATION) {
                throw new IllegalArgumentException("Institution-unique document requires SYSTEM, TENANT or ORGANIZATION scope: " + code);
            }
        }
    }
}
