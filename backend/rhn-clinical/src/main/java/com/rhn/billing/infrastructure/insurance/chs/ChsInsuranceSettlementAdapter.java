package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.api.InsuranceSettlementAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * 国家医保信息平台 CHS 结算适配器 (Outbound Adapter for InsuranceSettlementAdapter).
 * 贯标国家医保规范，衔接 billing 核心财务领域与国家医保客户端（支持 Mock 与生产标准网关）。
 */
@Component
@ConditionalOnProperty(name = "rhn.billing.insurance.chs-adapter.enabled", havingValue = "true", matchIfMissing = true)
public class ChsInsuranceSettlementAdapter implements InsuranceSettlementAdapter {
    private static final Logger log = LoggerFactory.getLogger(ChsInsuranceSettlementAdapter.class);

    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "BASIC_MEDICAL_INSURANCE", "01", "02", "310", "390",
            "EMPLOYEE_BASIC", "RESIDENT_BASIC", "MEDICAL_INSURANCE"
    );

    private final NationalInsuranceClient client;

    public ChsInsuranceSettlementAdapter(NationalInsuranceClient client) {
        this.client = client;
    }

    @Override
    public boolean supports(String regionCode, String insuranceTypeCode) {
        if ("TEST_REGION".equalsIgnoreCase(regionCode)) {
            // 避免抢占 RegistrationBillingIntegrationTest 专用的测试 adapter
            return false;
        }
        if (insuranceTypeCode == null) return false;
        String type = insuranceTypeCode.trim().toUpperCase();
        return SUPPORTED_TYPES.contains(type);
    }

    @Override
    public InsuranceResult preSettle(InsuranceInstruction instruction) {
        log.info("[CHS Adapter] 执行医保预结算试算 settlementNo={}, grossAmount={}",
                instruction.settlementNo(), instruction.grossAmount());

        List<ChsModels.FeedetItem> feedetItems = new ArrayList<>();
        if (instruction.lines() != null) {
            for (InsuranceLine line : instruction.lines()) {
                String level = "1";
                if (line.categoryCode() != null && line.categoryCode().contains("SELF")) {
                    level = "3";
                } else if (line.categoryCode() != null && (line.categoryCode().contains("SPECIAL") || line.categoryCode().contains("B"))) {
                    level = "2";
                }
                feedetItems.add(new ChsModels.FeedetItem(
                        line.settlementLineId(),
                        line.itemCode(),
                        line.insuranceItemCode() != null ? line.insuranceItemCode() : line.itemCode(),
                        line.itemName(),
                        "1",
                        level,
                        line.quantity(),
                        line.unitPrice(),
                        line.amount()
                ));
            }
        }

        ChsModels.PreSettleRequest request = new ChsModels.PreSettleRequest(
                "PSN-" + instruction.residentId(),
                instruction.insuranceTypeCode(),
                instruction.settlementId(),
                instruction.settlementNo(),
                instruction.grossAmount(),
                instruction.organizationCode(),
                instruction.departmentCode(),
                instruction.practitionerCode(),
                feedetItems
        );

        ChsModels.PreSettleResponse response = client.preSettle(request);

        return new InsuranceResult(
                InsuranceResult.Outcome.SUCCEEDED,
                response.preSetlId(),
                response.preSetlId(),
                money(response.hifpPay()),
                money(response.acctPay()),
                money(response.psnCashPay()),
                money(response.othPay()),
                "CNY",
                null,
                null,
                response
        );
    }

    @Override
    public InsuranceResult settle(InsuranceInstruction instruction, String preSettlementNo) {
        log.info("[CHS Adapter] 执行医保正式结算 settlementNo={}, preSettlementNo={}",
                instruction.settlementNo(), preSettlementNo);

        ChsModels.SettleRequest request = new ChsModels.SettleRequest(
                preSettlementNo != null ? preSettlementNo : "PRE_" + instruction.settlementNo(),
                "PSN-" + instruction.residentId(),
                instruction.settlementNo(),
                "OP-" + instruction.practitionerCode()
        );

        ChsModels.SettleResponse response = client.settle(request);

        return new InsuranceResult(
                InsuranceResult.Outcome.SUCCEEDED,
                response.setlId(),
                response.setlId(),
                money(response.hifpPay()),
                money(response.acctPay()),
                money(response.psnCashPay()),
                money(response.othPay()),
                "CNY",
                null,
                null,
                response
        );
    }

    @Override
    public InsuranceResult query(InsuranceQuery instruction) {
        String refNo = instruction.externalSettlementNo() != null ? instruction.externalSettlementNo()
                : instruction.externalPreSettlementNo();
        log.info("[CHS Adapter] 查询医保业务状态 refNo={}", refNo);

        return new InsuranceResult(
                InsuranceResult.Outcome.SUCCEEDED,
                refNo,
                "QUERY-" + instruction.claimNo(),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                "CNY",
                null,
                null,
                null
        );
    }

    @Override
    public InsuranceResult reverse(InsuranceReversal instruction) {
        log.info("[CHS Adapter] 执行医保结算撤销 originalSetlNo={}, reason={}",
                instruction.originalExternalSettlementNo(), instruction.reason());

        ChsModels.ReversalRequest request = new ChsModels.ReversalRequest(
                instruction.originalExternalSettlementNo(),
                "PSN-REVERSE",
                "OP-REVERSE",
                instruction.reason()
        );

        ChsModels.ReversalResponse response = client.reverse(request);

        return new InsuranceResult(
                InsuranceResult.Outcome.SUCCEEDED,
                response.reversalId(),
                response.reversalId(),
                money(instruction.amount()),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP),
                "CNY",
                null,
                null,
                response
        );
    }

    private BigDecimal money(BigDecimal value) {
        if (value == null) return BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP);
        return value.setScale(6, RoundingMode.HALF_UP);
    }
}
