package com.rhn.coordination.application;

import com.rhn.billing.api.RegistrationCancellationBillingDirectory;
import com.rhn.billing.api.RegistrationCancellationBillingDirectory.CancellationBillingResult;
import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterRequest;
import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterResponse;
import com.rhn.outpatient.api.OutpatientEncounterCancellationDirectory;
import com.rhn.outpatient.api.OutpatientEncounterCancellationDirectory.CancellationSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutpatientCancellationService {
    private final OutpatientEncounterCancellationDirectory outpatient;
    private final RegistrationCancellationBillingDirectory billing;

    public OutpatientCancellationService(OutpatientEncounterCancellationDirectory outpatient,
                                         RegistrationCancellationBillingDirectory billing) {
        this.outpatient = outpatient;
        this.billing = billing;
    }

    @Transactional
    public CancelEncounterResponse cancel(Long encounterId, CancelEncounterRequest request) {
        String commandCode = request.commandCode().trim();
        String reason = request.reason().trim();
        CancellationSnapshot prepared = outpatient.prepare(encounterId);
        CancellationBillingResult financial = billing.cancelBeforeService(
                encounterId, commandCode, reason, clean(request.terminalCode()));
        if (!financial.readyToClose()) return response(prepared, financial, false);
        return response(outpatient.cancelBeforeService(encounterId, commandCode, reason), financial, true);
    }

    private CancelEncounterResponse response(CancellationSnapshot outpatientState,
                                             CancellationBillingResult financial,
                                             boolean completed) {
        return new CancelEncounterResponse(outpatientState.encounterId(), outpatientState.encounterStatus(),
                outpatientState.registrationStatus(), outpatientState.queueStatus(),
                outpatientState.appointmentStatus(), financial.billingStatus(), financial.refundOrderId(),
                financial.refundStatus(), completed,
                completed ? "退号完成，候诊资格已关闭，相关号源已返还" : financial.message());
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
