package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Translates explicit CHS requests and confirmed responses; never invents protocol or money fields. */
@Component
@ConditionalOnProperty(name = "rhn.billing.insurance.chs-adapter.enabled", havingValue = "true", matchIfMissing = true)
public class ChsInsuranceSettlementAdapter implements InsuranceSettlementAdapter {
    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "BASIC_MEDICAL_INSURANCE", "01", "02", "310", "390",
            "EMPLOYEE_BASIC", "RESIDENT_BASIC", "MEDICAL_INSURANCE");
    private final NationalInsuranceClient client;
    public ChsInsuranceSettlementAdapter(NationalInsuranceClient client) { this.client = client; }

    @Override public boolean supports(String regionCode, String insuranceTypeCode) {
        return insuranceTypeCode != null && SUPPORTED_TYPES.contains(insuranceTypeCode.trim().toUpperCase(Locale.ROOT));
    }

    @Override public InsuranceResult preSettle(InsuranceInstruction input) {
        if (!client.isAvailable()) return unavailable(InsuranceResult.Outcome.FAILED);
        ChsModels.PreSettleRequest request;
        try {
            requireInstruction(input);
            request = client.preparePreSettle(input);
            require(request != null && text(request.psnNo()), "医保人员编号未确认");
            require(Objects.equals(request.settlementId(), input.settlementId())
                    && Objects.equals(request.settlementNo(), input.settlementNo())
                    && Objects.equals(request.insutype(), input.insuranceTypeCode())
                    && Objects.equals(request.organizationCode(), input.organizationCode())
                    && Objects.equals(request.departmentCode(), input.departmentCode())
                    && Objects.equals(request.practitionerCode(), input.practitionerCode()), "医保请求与原结算上下文不一致");
            same(request.medfeeSumamt(), input.grossAmount(), "医保请求总额不一致");
            require(input.lines() != null && !input.lines().isEmpty() && request.feedetList() != null
                    && request.feedetList().size() == input.lines().size(), "医保明细不完整");
            var seen = new HashSet<Long>();
            BigDecimal total = BigDecimal.ZERO;
            for (var item : request.feedetList()) {
                require(item != null && item.feedetId() != null && seen.add(item.feedetId()), "医保费用行重复或缺少标识");
                var originals = input.lines().stream().filter(line -> item.feedetId().equals(line.settlementLineId())).toList();
                require(originals.size() == 1, "医保费用行与原结算不一致");
                var original = originals.getFirst();
                require(text(item.hilistCode()) && item.hilistCode().equals(original.insuranceItemCode())
                        && Objects.equals(item.itemCode(), original.itemCode()) && text(item.hilistName()), "医保目录标识缺失或不一致");
                require(Set.of("1", "2", "3").contains(Objects.toString(item.listCategory(), ""))
                        && Set.of("1", "2", "3").contains(Objects.toString(item.chrgitmLv(), "")), "医保费用分类或项目等级未确认");
                same(item.cnt(), original.quantity(), "医保数量不一致");
                same(item.pric(), original.unitPrice(), "医保单价不一致");
                same(item.detItemFeeSumamt(), original.amount(), "医保费用行金额不一致");
                require(item.cnt().signum() > 0, "医保费用数量必须大于零");
                total = total.add(item.detItemFeeSumamt());
            }
            same(total, input.grossAmount(), "医保费用明细合计不一致");
        } catch (RuntimeException exception) { return unconfirmedRequest(exception); }

        // A malformed response after submission is uncertain; the application keeps the claim pending.
        var response = client.preSettle(request);
        require(response != null, "医保预结算未返回结果");
        require(input.currencyCode().equals(response.currency()), "医保预结算币种不一致或缺失");
        same(response.medfeeSumamt(), input.grossAmount(), "医保预结算总额不一致");
        return success(response.preSetlId(), response.hifpPay(), response.acctPay(), response.psnCashPay(),
                money(response.othPay()).add(money(response.cvdPay())), input.grossAmount(), input.currencyCode(), response);
    }

    @Override public InsuranceResult settle(InsuranceInstruction input, String preSettlementNo) {
        if (!client.isAvailable()) return unavailable(InsuranceResult.Outcome.FAILED);
        ChsModels.SettleRequest request;
        try {
            requireInstruction(input);
            require(text(preSettlementNo), "原医保预结算流水缺失");
            request = client.prepareSettle(input, preSettlementNo);
            require(request != null && text(request.psnNo()) && text(request.operatorId()), "医保人员或操作员标识未确认");
            require(preSettlementNo.equals(request.preSetlId()) && input.settlementNo().equals(request.settlementNo()), "医保正式结算请求与原预结算不一致");
        } catch (RuntimeException exception) { return unconfirmedRequest(exception); }
        var response = client.settle(request);
        require(response != null && preSettlementNo.equals(response.preSetlId()) && response.setlTime() != null,
                "医保正式结算未确认原预结算流水或结算时间");
        same(response.medfeeSumamt(), input.grossAmount(), "医保正式结算总额不一致");
        return success(response.setlId(), response.hifpPay(), response.acctPay(), response.psnCashPay(),
                money(response.othPay()).add(money(response.cvdPay())), input.grossAmount(), input.currencyCode(), response);
    }

    @Override public InsuranceResult query(InsuranceQuery instruction) {
        if (!client.isAvailable()) return unavailable(InsuranceResult.Outcome.PENDING);
        return unresolved(InsuranceResult.Outcome.PENDING, "CHS_QUERY_NOT_IMPLEMENTED", "医保交易状态查询尚未接入，请核实原交易结果", null);
    }

    @Override public InsuranceResult reverse(InsuranceReversal input) {
        if (!client.isAvailable()) return unavailable(InsuranceResult.Outcome.FAILED);
        ChsModels.ReversalRequest request;
        try {
            require(input != null && text(input.originalExternalSettlementNo()) && text(input.reason()), "医保冲正缺少原结算流水或原因");
            require(input.residentId() != null && input.coverageId() != null && text(input.practitionerCode()), "医保冲正原患者或医师上下文缺失");
            require("CNY".equals(input.currencyCode()), "当前 CHS 协议仅支持 CNY，不能替换原币种");
            allocation(input.insuranceFundAmount(), input.personalAccountAmount(), input.patientCashAmount(), input.otherFundAmount(), input.amount());
            request = client.prepareReversal(input);
            require(request != null && text(request.psnNo()) && text(request.operatorId()), "医保冲正人员或操作员标识未确认");
            require(input.originalExternalSettlementNo().equals(request.setlId()) && input.reason().equals(request.reversalReason()), "医保冲正请求与原申请不一致");
        } catch (RuntimeException exception) { return unconfirmedRequest(exception); }
        var response = client.reverse(request);
        require(response != null, "医保冲正未返回结果");
        if (!response.success()) return unresolved(InsuranceResult.Outcome.FAILED, "CHS_REVERSAL_FAILED", response.message(), response);
        require(input.originalExternalSettlementNo().equals(response.originalSetlId()) && response.reversalTime() != null,
                "医保冲正回执未确认原结算流水或撤销时间");
        // CHS acknowledges a full reversal. Restore the persisted original allocation, not an invented fund-only split.
        return success(response.reversalId(), input.insuranceFundAmount(), input.personalAccountAmount(), input.patientCashAmount(),
                input.otherFundAmount(), input.amount(), input.currencyCode(), response);
    }

    private static void requireInstruction(InsuranceInstruction input) {
        require(input != null && input.claimId() != null && input.settlementId() != null && input.residentId() != null
                && input.coverageId() != null && text(input.settlementNo()) && text(input.insuranceTypeCode())
                && text(input.organizationCode()) && text(input.departmentCode()) && text(input.practitionerCode()), "医保申请上下文不完整");
        require("CNY".equals(input.currencyCode()), "当前 CHS 协议仅支持 CNY，不能替换原币种");
        require(money(input.grossAmount()).signum() > 0, "医保费用总额必须大于零");
    }
    private static InsuranceResult success(String externalNo, BigDecimal fund, BigDecimal personal, BigDecimal patient,
                                           BigDecimal other, BigDecimal gross, String currency, Object payload) {
        require(text(externalNo), "医保成功回执缺少外部流水号");
        allocation(fund, personal, patient, other, gross);
        return new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED, externalNo, externalNo,
                money(fund), money(personal), money(patient), money(other), currency, null, null, payload);
    }
    private static void allocation(BigDecimal fund, BigDecimal personal, BigDecimal patient, BigDecimal other, BigDecimal gross) {
        same(money(fund).add(money(personal)).add(money(patient)).add(money(other)), gross, "医保资金分摊合计与原结算总额不一致");
    }
    private static BigDecimal money(BigDecimal value) {
        require(value != null && value.signum() >= 0, "医保金额缺失或为负数");
        try { return value.setScale(6, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException exception) { throw new IllegalStateException("医保金额精度超出账务支持范围", exception); }
    }
    private static void same(BigDecimal actual, BigDecimal expected, String message) {
        require(money(actual).compareTo(money(expected)) == 0, message);
    }
    private static boolean text(String value) { return value != null && !value.isBlank(); }
    private static void require(boolean valid, String message) { if (!valid) throw new IllegalStateException(message); }
    private static InsuranceResult unconfirmedRequest(RuntimeException exception) {
        return unresolved(InsuranceResult.Outcome.FAILED, "CHS_REQUEST_CONTEXT_UNCONFIRMED", exception.getMessage(), null);
    }
    private static InsuranceResult unavailable(InsuranceResult.Outcome outcome) {
        return unresolved(outcome, StandardChsNationalInsuranceClient.UNAVAILABLE_CODE, StandardChsNationalInsuranceClient.UNAVAILABLE_MESSAGE, null);
    }
    private static InsuranceResult unresolved(InsuranceResult.Outcome outcome, String code, String message, Object payload) {
        return new InsuranceResult(outcome, null, null, null, null, null, null, null, code, message, payload);
    }
}
