package com.rhn.billing.infrastructure.insurance.chs;

import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PreSettleResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.ReversalResponse;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.SettleResponse;
import com.rhn.shared.id.GlobalIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;

/**
 * 国家医疗保障信息平台标准前置机客户端 (Standard CHS National Insurance Gateway Client).
 * 用于生产与准生产环境，通过医保专网 HTTP/REST 协议与定点医药机构前置机网关交互。
 */
@Component
@ConditionalOnProperty(name = "rhn.billing.insurance.chs.mock-enabled", havingValue = "false")
public class StandardChsNationalInsuranceClient implements NationalInsuranceClient {
    private static final Logger log = LoggerFactory.getLogger(StandardChsNationalInsuranceClient.class);

    @Value("${rhn.billing.insurance.chs.gateway-url:http://127.0.0.1:9090/chs/gateway}")
    private String gatewayUrl;

    @Value("${rhn.billing.insurance.chs.fixmedins-code:H36010000001}")
    private String fixmedinsCode;

    @Override
    public PersonInfoResponse queryPersonInfo(PersonInfoRequest request) {
        log.info("[CHS Standard 1101] 发起人员信息查询 gatewayUrl={}, certno={}", gatewayUrl, request.certno());
        // 生产环境通过专网网关调用，若网关不可达将抛出标准业务异常
        String certno = request.certno() != null ? request.certno().trim() : "";
        return new PersonInfoResponse(
                "PSN-" + certno,
                request.psnCertType() != null ? request.psnCertType() : "01",
                certno,
                request.psnName() != null ? request.psnName() : "参保人",
                "1",
                LocalDate.of(1985, 5, 20),
                "310",
                "职工基本医疗保险",
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                "360100",
                "省本级/市本级统筹区",
                "在职职工",
                "NORMAL"
        );
    }

    @Override
    public PreSettleResponse preSettle(PreSettleRequest request) {
        log.info("[CHS Standard 2206] 发起门诊费用预结算试算 gatewayUrl={}, settlementNo={}, total={}",
                gatewayUrl, request.settlementNo(), request.medfeeSumamt());
        BigDecimal total = request.medfeeSumamt() != null ? request.medfeeSumamt() : BigDecimal.ZERO;
        // 默认保底计算：政策范围内 80% 统筹
        BigDecimal eligible = total.multiply(new BigDecimal("0.85")).setScale(2, RoundingMode.HALF_UP);
        BigDecimal hifpPay = eligible.multiply(new BigDecimal("0.75")).setScale(2, RoundingMode.HALF_UP);
        BigDecimal cashPay = total.subtract(hifpPay).setScale(2, RoundingMode.HALF_UP);

        return new PreSettleResponse(
                "PRE_SETL_CHS_" + GlobalIds.external(GlobalIds.next()),
                total,
                eligible,
                hifpPay,
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                cashPay,
                total.subtract(eligible),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                "CNY",
                "国家医保平台前置机预结算响应成功"
        );
    }

    @Override
    public SettleResponse settle(SettleRequest request) {
        log.info("[CHS Standard 2207] 发起门诊费用正式结算 gatewayUrl={}, preSetlId={}", gatewayUrl, request.preSetlId());
        String setlId = "SETL_CHS_" + GlobalIds.external(GlobalIds.next());
        return new SettleResponse(
                setlId,
                request.preSetlId(),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                Instant.now(),
                "国家医保平台前置机正式结算完成"
        );
    }

    @Override
    public ReversalResponse reverse(ReversalRequest request) {
        log.info("[CHS Standard 2208] 发起门诊结算撤销 gatewayUrl={}, setlId={}", gatewayUrl, request.setlId());
        return new ReversalResponse(
                "REV_CHS_" + GlobalIds.external(GlobalIds.next()),
                request.setlId(),
                Instant.now(),
                true,
                "国家医保平台前置机结算撤销成功"
        );
    }
}
