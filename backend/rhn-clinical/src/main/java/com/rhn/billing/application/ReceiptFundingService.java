package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Derives fiscal funding from posted tenders and their source records, never from an estimated remainder. */
@Service
class ReceiptFundingService {
    private final SettlementTenderRepository tenders;
    private final PaymentRepository payments;
    private final InsuranceClaimRepository claims;
    private final InsuranceClaimResponseRepository responses;

    ReceiptFundingService(SettlementTenderRepository tenders, PaymentRepository payments,
                          InsuranceClaimRepository claims, InsuranceClaimResponseRepository responses) {
        this.tenders = tenders; this.payments = payments; this.claims = claims; this.responses = responses;
    }

    Funding resolve(Settlement settlement) {
        require(settlement.status() == SettlementStatus.SETTLED && settlement.netAmount().signum() >= 0,
                "结算尚未结清或属于冲销结算");
        var rows = tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(settlement.tenantId(), settlement.id());
        var claim = claims.findByTenantIdAndSettlementId(settlement.tenantId(), settlement.id()).orElse(null);
        Map<Long, InsuranceClaimResponse> byResponse = claim == null ? Map.of() : responses
                .findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(settlement.tenantId(), claim.id()).stream()
                .collect(Collectors.toMap(InsuranceClaimResponse::id, value -> value));
        Map<Long, Map<String, BigDecimal>> insuranceRows = new HashMap<>();
        Set<Long> paymentIds = new HashSet<>();
        BigDecimal fund = BigDecimal.ZERO, personal = BigDecimal.ZERO, patient = BigDecimal.ZERO, other = BigDecimal.ZERO;
        for (var row : rows) {
            require(Objects.equals(settlement.currencyCode(), row.currencyCode()) && row.tenderAmount() != null
                    && row.tenderAmount().signum() != 0, "收款明细币种或金额不完整");
            var amount = row.tenderAmount();
            require((row.paymentId() == null) != (row.claimResponseId() == null), "收款明细缺少唯一资金来源");
            if (row.claimResponseId() != null) {
                require(claim != null && Objects.equals(claim.currencyCode(), settlement.currencyCode())
                        && Objects.equals(claim.patientAccountId(), settlement.patientAccountId()), "医保来源与结算不一致");
                var response = byResponse.get(row.claimResponseId());
                require(response != null && response.hasReportedAmounts() && "SUCCEEDED".equals(response.status())
                        && response.operation() != null && Set.of("SETTLE", "REVERSE").contains(response.operation())
                        && response.externalSettlementNo() != null && !response.externalSettlementNo().isBlank()
                        && (response.errorCode() == null || response.errorCode().isBlank()), "医保实收金额缺少已确认的正式回执");
                var group = insuranceRows.computeIfAbsent(row.claimResponseId(), ignored -> new HashMap<>());
                require(group.putIfAbsent(row.tenderType(), amount) == null, "同一医保回执存在重复收款类别");
                switch (row.tenderType()) {
                    case "INSURANCE_FUND" -> fund = fund.add(amount);
                    case "PERSONAL_ACCOUNT" -> personal = personal.add(amount);
                    case "SUBSIDY" -> other = other.add(amount);
                    default -> throw conflict("RECEIPT_FUNDING_UNVERIFIED", "医保收款类别无法确认");
                }
            } else {
                require(paymentIds.add(row.paymentId()), "同一支付记录重复计入结算");
                var payment = payments.findByIdAndTenantId(row.paymentId(), settlement.tenantId()).orElse(null);
                require(payment != null && "PAYMENT".equals(payment.paymentType()) && "COMPLETED".equals(payment.status())
                        && Objects.equals(payment.patientAccountId(), settlement.patientAccountId())
                        && Objects.equals(payment.organizationId(), settlement.organizationId())
                        && Objects.equals(payment.currencyCode(), settlement.currencyCode())
                        && payment.amount() != null && payment.paymentMethodCode() != null && amount.signum() > 0, "支付来源未完成或与结算不一致");
                var refunded = payments.refundedForPayment(settlement.tenantId(), payment.id());
                require(refunded != null && refunded.signum() >= 0 && amount.compareTo(payment.amount().subtract(refunded)) <= 0,
                        "收款已退回或超出支付记录的有效金额");
                boolean prepayment = "PREPAYMENT".equals(row.tenderType());
                String expectedType = switch (payment.paymentMethodCode()) {
                    case "CASH" -> "CASH";
                    case "BANK_CARD" -> "BANK_CARD";
                    case "WECHAT", "ALIPAY" -> "DIGITAL";
                    case "MEDICAL_INSURANCE" -> "PERSONAL_ACCOUNT";
                    default -> null;
                };
                require(expectedType != null && (prepayment ? !"PERSONAL_ACCOUNT".equals(expectedType)
                        : expectedType.equals(row.tenderType())), "支付方式与收款类别无法核对，需明确财政分摊");
                require(prepayment ? payment.invoiceId() == null && "INPATIENT_PREPAYMENT".equals(payment.paymentSceneCode())
                        : Objects.equals(payment.invoiceId(), settlement.legacyInvoiceId()) && payment.invoiceId() != null
                        && amount.compareTo(payment.amount()) == 0, "支付金额或所属账单无法确认");
                switch (row.tenderType()) {
                    case "PERSONAL_ACCOUNT" -> {
                        require("MEDICAL_INSURANCE".equals(payment.paymentMethodCode()), "个人账户收款来源无法确认");
                        personal = personal.add(amount);
                    }
                    case "CASH", "BANK_CARD", "DIGITAL", "PREPAYMENT" -> patient = patient.add(amount);
                    default -> throw conflict("RECEIPT_FUNDING_UNVERIFIED", "该支付类别尚无明确财政分摊，请核实后开票");
                }
            }
        }
        for (var entry : insuranceRows.entrySet()) {
            var response = byResponse.get(entry.getKey());
            int sign = "REVERSE".equals(response.operation()) ? -1 : 1;
            matchReported(entry.getValue(), "INSURANCE_FUND", response.insuranceFundAmount(), sign);
            matchReported(entry.getValue(), "PERSONAL_ACCOUNT", response.personalAccountAmount(), sign);
            matchReported(entry.getValue(), "SUBSIDY", response.otherFundAmount(), sign);
        }
        require(fund.signum() >= 0 && personal.signum() >= 0 && other.signum() >= 0 && patient.signum() >= 0,
                "冲销后的资金分摊为负数");
        require(equal(fund, settlement.insuranceAmount()) && equal(other, settlement.otherAmount())
                && equal(personal.add(patient), settlement.patientAmount())
                && equal(fund.add(personal).add(other).add(patient), settlement.netAmount()), "实收资金分摊与结算金额不一致");
        return new Funding(fund, personal, patient, other);
    }

    private static void matchReported(Map<String, BigDecimal> rows, String type, BigDecimal reported, int sign) {
        require(reported != null && reported.signum() >= 0, "医保回执未明确报告金额");
        // A confirmed zero has no tender row; absence alone is not evidence of zero.
        require(equal(rows.getOrDefault(type, BigDecimal.ZERO), reported.multiply(BigDecimal.valueOf(sign))),
                "医保收款明细与正式回执金额不一致");
    }

    private static boolean equal(BigDecimal a, BigDecimal b) { return b != null && a.compareTo(b) == 0; }
    private static void require(boolean condition, String message) {
        if (!condition) throw conflict("RECEIPT_FUNDING_UNVERIFIED", message);
    }
    record Funding(BigDecimal insuranceAmount, BigDecimal personalAccountAmount, BigDecimal patientAmount, BigDecimal otherFundAmount) {}
}
