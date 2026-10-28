package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceDebugViews.ClaimActionResult;
import com.rhn.billing.api.InsuranceDebugViews.ClaimAttentionView;
import com.rhn.billing.api.InsuranceDebugViews.ReverseClaimRequest;
import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * 调试控制台的异常交易处理：列出需要人工介入的医保申请、向医保平台查询结果、手动冲正。
 * 全部复用 {@link InsuranceClaimApplicationService}，不另写协议或状态机；与调试开关无关，开关关闭时仍可冲正。
 *
 * <p>冲正会动真实资金，因此：独立权限、必须重新输入申请号确认、必填原因；对结果未定的申请先向医保查询，
 * 医保侧已撤销则不重复冲正，医保侧仍不明确则不冲正。每次操作写入专用审计日志。
 */
@Service
public class InsuranceDebugClaimService {
    private static final Logger audit = LoggerFactory.getLogger("rhn.insurance.debug.audit");
    private static final int MIN_REASON = 2;
    private static final int MAX_REASON = 500;

    private final InsuranceClaimApplicationService claims;
    private final ExecutionContextProvider contextProvider;

    public InsuranceDebugClaimService(InsuranceClaimApplicationService claims, ExecutionContextProvider contextProvider) {
        this.claims = claims; this.contextProvider = contextProvider;
    }

    public List<ClaimAttentionView> attention(int limit) {
        return claims.attentionWorklist(limit).stream().map(InsuranceDebugClaimService::attentionView).toList();
    }

    public ClaimActionResult query(String externalClaimId) {
        long claimId = claimId(externalClaimId);
        ExecutionContext context = contextProvider.requireCurrent();
        InsuranceSettlementView view = claims.query(claimId, "DBG-Q-" + GlobalIds.next());
        audit.info("insurance debug query by={} claim={} status={}", context.actor(), view.claimNo(), view.status());
        return new ClaimActionResult("QUERIED", "已向医保平台查询，申请状态：" + statusText(view), attentionView(view));
    }

    public ClaimActionResult reverse(String externalClaimId, ReverseClaimRequest request) {
        long claimId = claimId(externalClaimId);
        ExecutionContext context = contextProvider.requireCurrent();
        String reason = request == null || request.reason() == null ? "" : request.reason().trim();
        if (reason.length() < MIN_REASON || reason.length() > MAX_REASON) {
            throw badRequest("INSURANCE_DEBUG_REVERSAL_REASON_INVALID", "冲正原因须填写 " + MIN_REASON + " 到 " + MAX_REASON + " 个字");
        }
        InsuranceSettlementView before = claims.get(claimId);
        String confirm = request.confirmClaimNo() == null ? "" : request.confirmClaimNo().trim();
        if (!before.claimNo().equals(confirm)) {
            throw badRequest("INSURANCE_DEBUG_CONFIRM_MISMATCH", "确认的申请号与所选申请不一致");
        }
        InsuranceSettlementView current = before;
        // 已结算说明医保平台已确认；结果未定（含冲正失败）的先向医保核实，避免对已撤销或未结算成功的交易重复冲正。
        if (!"SETTLED".equals(before.status())) {
            current = claims.query(claimId, "DBG-Q-" + GlobalIds.next());
        }
        if ("REVERSED".equals(current.status())) {
            audit.info("insurance debug reverse skipped by={} claim={} reason=already-reversed", context.actor(), current.claimNo());
            return new ClaimActionResult("ALREADY_REVERSED", "医保平台显示该交易已撤销，无需再次冲正。", attentionView(current));
        }
        if (!reversible(current)) {
            audit.info("insurance debug reverse refused by={} claim={} status={}", context.actor(), current.claimNo(), current.status());
            return new ClaimActionResult("NOT_REVERSIBLE", "查询后申请状态为「" + statusText(current) + "」，不满足冲正条件，未执行冲正。", attentionView(current));
        }
        InsuranceSettlementView after = claims.reverse(claimId, "DBG-R-" + claimId + "-" + current.revision(), reason);
        audit.info("insurance debug reverse by={} claim={} before={} after={} reason={}", context.actor(), after.claimNo(),
                current.status(), after.status(), reason);
        boolean done = "REVERSED".equals(after.status());
        return new ClaimActionResult(done ? "REVERSED" : "REVERSAL_PENDING",
                done ? "冲正成功。" : "冲正已提交但医保平台结果未确认，请稍后查询结果或重试冲正。", attentionView(after));
    }

    private long claimId(String value) {
        try { return GlobalIds.parseExternal(value); }
        catch (RuntimeException invalid) { throw notFound("INSURANCE_CLAIM_NOT_FOUND", "未找到该医保申请"); }
    }

    private static boolean reversible(InsuranceSettlementView view) {
        return switch (view.status()) {
            case "SETTLED", "REVERSAL_PENDING" -> true;
            case "FAILED" -> "REVERSE".equals(view.currentOperation());
            default -> false;
        };
    }

    private static boolean queryable(InsuranceSettlementView view) {
        return switch (view.status()) {
            case "PRE_SETTLEMENT_PENDING", "SETTLEMENT_PENDING", "REVERSAL_PENDING" -> true;
            case "FAILED" -> "REVERSE".equals(view.currentOperation());
            default -> false;
        };
    }

    static ClaimAttentionView attentionView(InsuranceSettlementView view) {
        return new ClaimAttentionView(GlobalIds.external(view.claimId()), view.claimNo(), view.settlementNo(), view.status(), statusText(view),
                view.currentOperation(), reason(view), view.errorCode(), view.errorMessage(), view.grossAmount(), view.insuranceFundAmount(),
                view.personalAccountAmount(), view.patientCashAmount(), view.externalSettlementNo(), view.reversalReason(),
                queryable(view), reversible(view));
    }

    private static String statusText(InsuranceSettlementView view) {
        return switch (view.status()) {
            case "PRE_SETTLEMENT_PENDING" -> "预结算结果未定"; case "PRE_SETTLED" -> "已预结算"; case "SETTLEMENT_PENDING" -> "结算结果未定";
            case "SETTLED" -> "已结算"; case "REVERSAL_PENDING" -> "冲正待完成"; case "REVERSED" -> "已冲正";
            case "FAILED" -> "REVERSE".equals(view.currentOperation()) ? "冲正失败" : "失败"; default -> view.status();
        };
    }

    private static String reason(InsuranceSettlementView view) {
        return switch (view.status()) {
            case "PRE_SETTLEMENT_PENDING" -> "预结算请求已发出但结果未确认，需向医保查询";
            case "SETTLEMENT_PENDING" -> "结算请求已发出但结果未确认，可能已扣费，需向医保查询后决定是否冲正";
            case "REVERSAL_PENDING" -> "冲正已发起但结果未确认，需查询或重试冲正";
            case "FAILED" -> "冲正被医保平台拒绝或失败，需核实后重试";
            default -> "需要人工核对";
        };
    }
}
