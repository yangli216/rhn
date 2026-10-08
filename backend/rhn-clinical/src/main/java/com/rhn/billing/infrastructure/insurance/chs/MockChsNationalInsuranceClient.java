package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.infrastructure.insurance.chs.ChsModels.FeedetItem;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleResponse;
import com.rhn.shared.id.GlobalIds;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 仅用于离线测试的医保 CHS 示例模拟器 (Mock National Insurance Client)。
 * 方便本地开发、离线调试与集成演示，通过 rhn.billing.insurance.chs.mock-enabled 灵活切换。
 * 以下是固定的测试分摊规则，不代表真实地区的医保待遇或参保事实：
 * - 甲类项目：100% 纳入合规政策范围，统筹基金报销 80%；
 * - 乙类项目：15% 先行自理，剩余 85% 纳入政策范围统筹报销 70%；
 * - 丙类/全自费：100% 个人自费；
 * - 统筹报销后剩余金额优先由个人账户 (acct_pay) 抵扣，不足部分转为个人现金自付 (psn_cash_pay)。
 */
@Component
@ConditionalOnProperty(name = "rhn.billing.insurance.chs.mock-enabled", havingValue = "true")
public class MockChsNationalInsuranceClient implements NationalInsuranceClient {
    private static final Logger log = LoggerFactory.getLogger(MockChsNationalInsuranceClient.class);

    // 内存预结算缓存，用于正式结算校验
    private final Map<String, PreSettleResponse> preSettlements = new ConcurrentHashMap<>();
    private final Map<String, SettleResponse> settlements = new ConcurrentHashMap<>();

    /** Synthetic identities and classifications are confined to the opt-in simulator. */
    @Override
    public PreSettleRequest preparePreSettle(InsuranceInstruction input) {
        var items = input.lines().stream().map(line -> {
            String level = "1";
            if (line.categoryCode() != null && line.categoryCode().contains("SELF")) level = "3";
            else if (line.categoryCode() != null && (line.categoryCode().contains("SPECIAL") || line.categoryCode().contains("B"))) level = "2";
            return new FeedetItem(line.settlementLineId(), line.itemCode(), line.insuranceItemCode(), line.itemName(),
                    "1", level, line.quantity(), line.unitPrice(), line.amount());
        }).toList();
        return new PreSettleRequest("MOCK-PSN-" + input.residentId(), input.insuranceTypeCode(), input.settlementId(),
                input.settlementNo(), input.grossAmount(), input.organizationCode(), input.departmentCode(), input.practitionerCode(), items);
    }
    @Override
    public SettleRequest prepareSettle(InsuranceInstruction input, String preSettlementNo) {
        return new SettleRequest(preSettlementNo, "MOCK-PSN-" + input.residentId(), input.settlementNo(), "MOCK-OP-" + input.practitionerCode());
    }
    @Override
    public ReversalRequest prepareReversal(InsuranceReversal input) {
        return new ReversalRequest(input.originalExternalSettlementNo(), "MOCK-PSN-" + input.residentId(),
                "MOCK-OP-" + input.practitionerCode(), input.reason());
    }

    @Override
    public PersonInfoResponse queryPersonInfo(PersonInfoRequest request) {
        String certno = request.certno() != null ? request.certno().trim() : "360102198801011234";
        boolean isResident = certno.contains("390") || certno.endsWith("9");
        String psnName = request.psnName() != null && !request.psnName().isBlank() ? request.psnName() : "张国华";
        String insutype = isResident ? "390" : "310";
        String insutypeName = isResident ? "城乡居民基本医疗保险" : "职工基本医疗保险";
        BigDecimal balance = isResident ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP) : new BigDecimal("1850.00");

        log.info("[CHS-Mock 1101] 人员信息鉴权成功 psnName={}, certno={}, insutype={}, balance={}",
                psnName, certno, insutypeName, balance);

        return new PersonInfoResponse(
                "PSN-" + certno.substring(Math.max(0, certno.length() - 6)),
                request.psnCertType() != null ? request.psnCertType() : "01",
                certno,
                psnName,
                "1",
                LocalDate.of(1988, 1, 1),
                insutype,
                insutypeName,
                balance,
                "360100",
                "南昌市统筹区",
                isResident ? "普通居民" : "在职职工",
                "NORMAL"
        );
    }

    @Override
    public PreSettleResponse preSettle(PreSettleRequest request) {
        BigDecimal total = request.medfeeSumamt() != null ? request.medfeeSumamt().setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal hifpPay = BigDecimal.ZERO;      // 统筹基金支出
        BigDecimal preselfpayAmt = BigDecimal.ZERO; // 先行自付
        BigDecimal fulamtOwnpayAmt = BigDecimal.ZERO;// 全自费
        BigDecimal inscpAmt = BigDecimal.ZERO;     // 符合政策范围金额

        if (request.feedetList() != null && !request.feedetList().isEmpty()) {
            for (FeedetItem item : request.feedetList()) {
                BigDecimal lineAmount = item.detItemFeeSumamt() != null ? item.detItemFeeSumamt() : BigDecimal.ZERO;
                String level = item.chrgitmLv() != null ? item.chrgitmLv() : "1";
                if ("3".equals(level)) {
                    // 丙类/自费
                    fulamtOwnpayAmt = fulamtOwnpayAmt.add(lineAmount);
                } else if ("2".equals(level)) {
                    // 乙类 (15% 先行自理，剩余 85% 纳入报销，报销 70%)
                    BigDecimal selfRatio = lineAmount.multiply(new BigDecimal("0.15")).setScale(2, RoundingMode.HALF_UP);
                    BigDecimal eligible = lineAmount.subtract(selfRatio);
                    BigDecimal reimbursement = eligible.multiply(new BigDecimal("0.70")).setScale(2, RoundingMode.HALF_UP);
                    preselfpayAmt = preselfpayAmt.add(selfRatio);
                    inscpAmt = inscpAmt.add(eligible);
                    hifpPay = hifpPay.add(reimbursement);
                } else {
                    // 甲类 (100% 纳入报销，统筹报销 80%)
                    inscpAmt = inscpAmt.add(lineAmount);
                    BigDecimal reimbursement = lineAmount.multiply(new BigDecimal("0.80")).setScale(2, RoundingMode.HALF_UP);
                    hifpPay = hifpPay.add(reimbursement);
                }
            }
        } else {
            // 无明细时使用模拟样例：符合政策 90%，统筹报销 75%
            inscpAmt = total.multiply(new BigDecimal("0.90")).setScale(2, RoundingMode.HALF_UP);
            hifpPay = inscpAmt.multiply(new BigDecimal("0.75")).setScale(2, RoundingMode.HALF_UP);
            preselfpayAmt = total.subtract(inscpAmt);
        }

        // 确保统筹报销不超过总额
        hifpPay = hifpPay.min(total).setScale(2, RoundingMode.HALF_UP);

        // 剩余个人应承担部分
        BigDecimal remaining = total.subtract(hifpPay);

        // 个人账户扣缴模拟：职工医保若账户有余额，优先扣个账
        boolean isEmployee = !"390".equals(request.insutype());
        BigDecimal acctPay = BigDecimal.ZERO;
        BigDecimal mockAccountBalance = new BigDecimal("1850.00");
        if (isEmployee && remaining.signum() > 0) {
            acctPay = remaining.min(mockAccountBalance).setScale(2, RoundingMode.HALF_UP);
        }
        // 现金自付为扣除统筹与个账后的剩余
        BigDecimal psnCashPay = remaining.subtract(acctPay).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);

        String preSetlId = "PRE_SETL_CHS_" + System.currentTimeMillis() + "_" + GlobalIds.randomSuffix(8);
        PreSettleResponse response = new PreSettleResponse(
                preSetlId,
                total,
                inscpAmt,
                hifpPay,
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                acctPay,
                psnCashPay,
                fulamtOwnpayAmt,
                preselfpayAmt,
                "CNY",
                "医保门诊预结算试算成功（国家医保CHS模拟引擎）"
        );

        preSettlements.put(preSetlId, response);
        log.info("[CHS-Mock 2206] 门诊预结算完成 preSetlId={}, 总额={}, 统筹={}, 个账={}, 现金自付={}",
                preSetlId, total, hifpPay, acctPay, psnCashPay);

        return response;
    }

    @Override
    public SettleResponse settle(SettleRequest request) {
        String preSetlId = request.preSetlId();
        PreSettleResponse pre = preSettlements.get(preSetlId);
        if (pre == null) throw com.rhn.shared.api.BusinessErrors.conflict("CHS_MOCK_PRE_SETTLEMENT_NOT_FOUND", "模拟医保预结算流水不存在，不能补造正式结算金额");
        BigDecimal total = pre.medfeeSumamt();
        BigDecimal hifpPay = pre.hifpPay();
        BigDecimal acctPay = pre.acctPay();
        BigDecimal psnCashPay = pre.psnCashPay();

        String setlId = "SETL_CHS_" + System.currentTimeMillis() + "_" + GlobalIds.randomSuffix(8);
        SettleResponse response = new SettleResponse(
                setlId,
                preSetlId,
                total,
                hifpPay,
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                acctPay,
                psnCashPay,
                Instant.now(),
                "模拟医保正式结算成功（仅限离线测试）"
        );

        settlements.put(setlId, response);
        log.info("[CHS-Mock 2207] 门诊正式结算成功 setlId={}, preSetlId={}, settlementNo={}",
                setlId, preSetlId, request.settlementNo());

        return response;
    }

    @Override
    public ReversalResponse reverse(ReversalRequest request) {
        String setlId = request.setlId();
        if (settlements.remove(setlId) == null) {
            return new ReversalResponse(null, setlId, Instant.now(), false, "模拟医保原结算不存在或已撤销");
        }
        String reversalId = "REV_CHS_" + System.currentTimeMillis() + "_" + GlobalIds.randomSuffix(8);

        log.info("[CHS-Mock 2208] 门诊结算撤销成功 reversalId={}, originalSetlId={}, reason={}",
                reversalId, setlId, request.reversalReason());

        return new ReversalResponse(
                reversalId,
                setlId,
                Instant.now(),
                true,
                "模拟医保结算已撤销（仅限离线测试）"
        );
    }
}
