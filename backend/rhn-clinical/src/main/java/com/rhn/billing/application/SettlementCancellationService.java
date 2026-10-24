package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.CancelledSettlementView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * 取消未付款结算单，所含收费回到待结算。收费处发现问题不再结算时手动取消；医生修改或取消签署已进结算单的医嘱、
 * 诊毕页生成结算单后放弃收款时自动取消。已试算医保的先撤销医保平台的费用明细（外部调用不放在数据库事务内），
 * 成功后再删除本地结算单；医保撤销失败时结算单保持不变。
 */
@Service
public class SettlementCancellationService {
    private final SettlementCancellationTransactions transactions;
    private final InsuranceClaimApplicationService insurance;
    private final ExecutionContextProvider contextProvider;

    SettlementCancellationService(SettlementCancellationTransactions transactions, InsuranceClaimApplicationService insurance,
                                  ExecutionContextProvider contextProvider) {
        this.transactions = transactions; this.insurance = insurance; this.contextProvider = contextProvider;
    }

    public CancelledSettlementView cancel(Long settlementId, String reason) {
        ExecutionContext context = requireWorkContext();
        return cancel(context, settlementId, requiredReason(reason));
    }

    /** 取消本就诊全部可取消的未付款结算单；挂号、已发起支付或医保已结算的保持不变。 */
    public List<CancelledSettlementView> cancelUnpaidForEncounter(Long encounterId, String reason) {
        ExecutionContext context = requireWorkContext();
        String normalized = requiredReason(reason);
        List<CancelledSettlementView> result = new ArrayList<>();
        for (Long settlementId : transactions.cancellableForEncounter(context, encounterId)) {
            result.add(cancel(context, settlementId, normalized));
        }
        return result;
    }

    /**
     * 按明确列出的结算单批量取消：诊毕页放弃收款时一次请求完成多张未付款结算单，避免逐单往返。
     * 每张仍按逐单取消的规则校验；中途某张不可取消时抛出，此前已取消的保持不变。
     */
    public List<CancelledSettlementView> cancelSeveral(List<Long> settlementIds, String reason) {
        ExecutionContext context = requireWorkContext();
        String normalized = requiredReason(reason);
        List<Long> ids = settlementIds == null ? List.of() : settlementIds.stream()
                .filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) throw badRequest("SETTLEMENT_CANCEL_TARGET_REQUIRED", "请选择要取消的结算单");
        List<CancelledSettlementView> result = new ArrayList<>(ids.size());
        for (Long settlementId : ids) {
            result.add(cancel(context, settlementId, normalized));
        }
        return result;
    }

    private CancelledSettlementView cancel(ExecutionContext context, Long settlementId, String reason) {
        Long preSettledClaimId = transactions.prepare(context, settlementId);
        String insuranceNote = preSettledClaimId == null ? null : insurance.cancelPreSettlement(preSettledClaimId);
        var cancelled = transactions.remove(context, settlementId, reason, insuranceNote);
        return new CancelledSettlementView(cancelled.settlementId(), cancelled.settlementNo(), cancelled.netAmount(),
                cancelled.chargeItemIds(), cancelled.insuranceNote());
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("BILLING_WORK_CONTEXT_REQUIRED", "收费操作必须选择工作机构");
        return context;
    }

    private static String requiredReason(String reason) {
        String value = Strings.trimToNull(reason);
        if (value == null) throw badRequest("SETTLEMENT_CANCEL_REASON_REQUIRED", "请填写取消结算单的原因");
        if (value.length() > 200) throw badRequest("SETTLEMENT_CANCEL_REASON_TOO_LONG", "取消原因不能超过 200 字");
        return value;
    }
}
