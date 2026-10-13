package com.rhn.outpatient;

import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberScope;
import org.springframework.stereotype.Component;
import java.util.Set;

/** Static affixes cannot distinguish two owners inside tenant-unique clinical document numbers. */
@Component
public class OutpatientBusinessNumberingPolicy {
    public OutpatientBusinessNumberingPolicy(BusinessNumberGenerator numbers) {
        validate(numbers);
    }

    public static void validate(BusinessNumberGenerator numbers) {
        var tenantUnique = Set.of("outpatient-encounter", "outpatient-appointment", "outpatient-registration",
                "outpatient-triage", "outpatient-referral", "medication-request", "service-request", "prescription",
                "schedule-resource", "schedule-template", "schedule", "schedule-slot-pool", "treatment-task",
                "diagnostic-task", "pharmacy-dispense-task", "pharmacy-review", "pharmacy-return", "invoice",
                "payment-order", "refund-order", "payment", "refund", "receipt", "insurance-claim",
                "cashier-close", "cashier-reopen", "reconciliation-batch");
        for (String code : tenantUnique) {
            var rule = numbers.rules().get(code);
            if (rule == null) throw new IllegalArgumentException("Missing outpatient business numbering rule: " + code);
            if (rule.scope() != BusinessNumberScope.SYSTEM && rule.scope() != BusinessNumberScope.TENANT) {
                throw new IllegalArgumentException("Tenant-unique outpatient number requires SYSTEM or TENANT scope: " + code);
            }
        }
    }
}
