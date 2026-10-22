package com.rhn.coordination.application;

import com.rhn.billing.api.RegistrationCancellationBillingDirectory;
import com.rhn.billing.api.RegistrationCancellationBillingDirectory.CancellationBillingResult;
import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterRequest;
import com.rhn.coordination.api.OutpatientCancellationViews.CancelEncounterResponse;
import com.rhn.outpatient.api.OutpatientEncounterCancellationDirectory;
import com.rhn.outpatient.api.OutpatientEncounterCancellationDirectory.CancellationSnapshot;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;

/**
 * 退号编排刻意不加外层事务：门诊预检、计费（含医保冲正/渠道退款等外部调用）、门诊关闭各自独立提交，
 * 外部调用不持有就诊/意向锁，失败标记（markCancellationFailed）也不会被随后的异常回滚。
 */
/**
 * 退号编排刻意不加外层事务：门诊预检、计费（含医保冲正/渠道退款等外部调用）、门诊关闭各自独立提交，
 * 外部调用不持有就诊/意向锁，失败标记（markCancellationFailed）也不会被随后的异常回滚。
 */
@Service
public class OutpatientCancellationService {
    private final OutpatientEncounterCancellationDirectory outpatient;
    private final RegistrationCancellationBillingDirectory billing;

    public OutpatientCancellationService(OutpatientEncounterCancellationDirectory outpatient,
                                         RegistrationCancellationBillingDirectory billing) {
        this.outpatient = outpatient;
        this.billing = billing;
    }

    public CancelEncounterResponse cancel(Long encounterId, CancelEncounterRequest request) {
        String commandCode = request.commandCode().trim();
        String reason = request.reason().trim();
        CancellationSnapshot prepared = outpatient.prepare(encounterId);
        CancellationBillingResult financial = billing.cancelBeforeService(
                encounterId, commandCode, reason, Strings.trimToNull(request.terminalCode()));
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
}
