package com.rhn.billing.infrastructure.fiscal;

import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalIssueResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalRedFlushResponse;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidRequest;
import com.rhn.billing.infrastructure.fiscal.FiscalModels.FiscalVoidResponse;
import com.rhn.shared.id.GlobalIds;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.Year;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 高保真财政电子票据离线仿真调试引擎 (Mock Fiscal Receipt Client)。
 * 方便本地开发、离线调试与现场演示，通过 rhn.billing.fiscal.mock-enabled 灵活切换。
 * 遵循全国/省财政电子票据核心规范四要素：
 * 1. 电子票据代码（10位代码，行政区划+票据类型+年份）
 * 2. 电子票据号码（10位顺序码）
 * 3. 安全防伪校验码（6位数字校验码）
 * 4. 省财政公共查验服务验证 URL
 */
@Component
@ConditionalOnProperty(name = "rhn.billing.fiscal.mock-enabled", havingValue = "true", matchIfMissing = true)
public class MockFiscalReceiptClient implements NationalFiscalReceiptClient {
    private static final Logger log = LoggerFactory.getLogger(MockFiscalReceiptClient.class);

    // 模拟票据号码自增发号器，起始基准号码
    private final AtomicLong invoiceNumberSequence = new AtomicLong(1859230L);

    // 内存票据存储库，支持查验与冲红关联
    private final Map<String, StoredFiscalReceipt> storage = new ConcurrentHashMap<>();

    @Override
    public FiscalIssueResponse issue(FiscalIssueRequest request) {
        log.info("[Fiscal Mock] 接收到电子票据开具请求 settlementId={}, receiptRequestNo={}, amount={}",
                request.settlementId(), request.receiptRequestNo(), request.totalAmount());

        String fiscalCode = generateFiscalCode(request.fiscalAuthorityCode());
        String fiscalNumber = String.format("%010d", invoiceNumberSequence.incrementAndGet());
        String verificationCode = String.format("%06d", ThreadLocalRandom.current().nextInt(100000, 999999));
        String externalReceiptNo = "EINV-" + GlobalIds.next();
        Instant issuedAt = Instant.now();
        String verifyUrl = buildVerifyUrl(fiscalCode, fiscalNumber, verificationCode);

        StoredFiscalReceipt record = new StoredFiscalReceipt(
                externalReceiptNo,
                fiscalCode,
                fiscalNumber,
                verificationCode,
                verifyUrl,
                request.receiptRequestNo(),
                "ISSUED",
                issuedAt
        );

        storage.put(externalReceiptNo, record);
        storage.put(request.receiptRequestNo(), record);

        log.info("[Fiscal Mock] 电子票据开具成功: 代码={}, 号码={}, 校验码={}, 查验URL={}",
                fiscalCode, fiscalNumber, verificationCode, verifyUrl);

        return FiscalIssueResponse.success(externalReceiptNo, fiscalCode, fiscalNumber,
                verificationCode, verifyUrl, issuedAt);
    }

    @Override
    public FiscalIssueResponse query(String receiptRequestNo, String externalReceiptNo, String correlationId) {
        log.info("[Fiscal Mock] 查询电子票据状态 receiptRequestNo={}, externalReceiptNo={}",
                receiptRequestNo, externalReceiptNo);

        StoredFiscalReceipt record = null;
        if (externalReceiptNo != null && !externalReceiptNo.isBlank()) {
            record = storage.get(externalReceiptNo);
        }
        if (record == null && receiptRequestNo != null && !receiptRequestNo.isBlank()) {
            record = storage.get(receiptRequestNo);
        }

        if (record == null) {
            // 若为模拟数据初次查询未命中，生成确定性模拟票据返回
            String fiscalCode = generateFiscalCode(null);
            String fiscalNumber = String.format("%010d", invoiceNumberSequence.incrementAndGet());
            String verificationCode = "889966";
            String verifyUrl = buildVerifyUrl(fiscalCode, fiscalNumber, verificationCode);
            Instant issuedAt = Instant.now();
            return FiscalIssueResponse.success(
                    externalReceiptNo != null ? externalReceiptNo : "EINV-" + GlobalIds.next(),
                    fiscalCode, fiscalNumber, verificationCode, verifyUrl, issuedAt
            );
        }

        return FiscalIssueResponse.success(
                record.externalReceiptNo(),
                record.fiscalCode(),
                record.fiscalNumber(),
                record.verificationCode(),
                record.verifyUrl(),
                record.issuedAt()
        );
    }

    @Override
    public FiscalVoidResponse voidReceipt(FiscalVoidRequest request) {
        log.info("[Fiscal Mock] 电子票据作废请求 externalReceiptNo={}, reason={}",
                request.externalReceiptNo(), request.reason());

        StoredFiscalReceipt record = storage.get(request.externalReceiptNo());
        if (record != null) {
            storage.put(request.externalReceiptNo(), record.withStatus("VOIDED"));
        }
        return FiscalVoidResponse.success(request.externalReceiptNo(), Instant.now());
    }

    @Override
    public FiscalRedFlushResponse redFlush(FiscalRedFlushRequest request) {
        log.info("[Fiscal Mock] 电子票据红字冲红请求 originalExternalReceiptNo={}, reason={}",
                request.originalExternalReceiptNo(), request.reason());

        String redFiscalCode = request.originalFiscalCode() != null ? request.originalFiscalCode() : generateFiscalCode(null);
        String redFiscalNumber = String.format("%010d", invoiceNumberSequence.incrementAndGet());
        String verificationCode = String.format("%06d", ThreadLocalRandom.current().nextInt(100000, 999999));
        String redExternalReceiptNo = "RED-EINV-" + GlobalIds.next();
        Instant issuedAt = Instant.now();
        String verifyUrl = buildVerifyUrl(redFiscalCode, redFiscalNumber, verificationCode);

        StoredFiscalReceipt redRecord = new StoredFiscalReceipt(
                redExternalReceiptNo,
                redFiscalCode,
                redFiscalNumber,
                verificationCode,
                verifyUrl,
                request.receiptRequestNo(),
                "RED_FLUSHED",
                issuedAt
        );
        storage.put(redExternalReceiptNo, redRecord);

        log.info("[Fiscal Mock] 电子票据红冲成功: 红字代码={}, 红字号码={}, 校验码={}",
                redFiscalCode, redFiscalNumber, verificationCode);

        return FiscalRedFlushResponse.success(redExternalReceiptNo, redFiscalCode, redFiscalNumber,
                verificationCode, verifyUrl, issuedAt);
    }

    private String generateFiscalCode(String fiscalAuthorityCode) {
        // 行政区划与统筹区前缀（4位）：如3601为江西南昌/省直
        String areaPrefix = "3601";
        if (fiscalAuthorityCode != null && fiscalAuthorityCode.matches("^\\d{4,6}.*")) {
            areaPrefix = fiscalAuthorityCode.substring(0, 4);
        } else if (fiscalAuthorityCode != null && fiscalAuthorityCode.matches("^\\d{2}.*")) {
            areaPrefix = fiscalAuthorityCode.substring(0, 2) + "01";
        }
        // 票据分类代码：06为医疗收费，01为门诊电子票据，后2位为年份后两位，合计10位代码
        int year = Year.now().getValue() % 100;
        return String.format("%s0601%02d", areaPrefix, year);
    }

    private String buildVerifyUrl(String fiscalCode, String fiscalNumber, String verificationCode) {
        return String.format(
                "https://pjcy.jx-fiscal.gov.cn/bill/verify?bill_code=%s&bill_no=%s&check_code=%s",
                fiscalCode, fiscalNumber, verificationCode
        );
    }

    private record StoredFiscalReceipt(
            String externalReceiptNo,
            String fiscalCode,
            String fiscalNumber,
            String verificationCode,
            String verifyUrl,
            String receiptRequestNo,
            String status,
            Instant issuedAt
    ) {
        public StoredFiscalReceipt withStatus(String newStatus) {
            return new StoredFiscalReceipt(externalReceiptNo, fiscalCode, fiscalNumber,
                    verificationCode, verifyUrl, receiptRequestNo, newStatus, issuedAt);
        }
    }
}
