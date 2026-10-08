package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.outpatient.api.ClinicalOrderBillingDisposition;
import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Objects;

/** Validated immutable facts from the version 2 clinical billing event contract. */
record ClinicalOrderChargeFacts(Long encounterId, Long residentId, Long organizationId, Long departmentId,
                                Long catalogItemId, Long authoredBy, Long actorId, BigDecimal quantity,
                                BigDecimal unitPrice, BigDecimal totalAmount, String currency, Long priceId,
                                Long priceRevision, String priceType, String unitCode, String itemCode,
                                String itemName, String requestNo, String accountingCategory, Instant occurredAt,
                                ClinicalOrderBillingDisposition disposition) {
    static ClinicalOrderChargeFacts read(DomainEventEnvelope event) {
        boolean medication = event.eventType().startsWith("MEDICATION_REQUEST");
        boolean cancellation = event.eventType().endsWith("_CANCELLED");
        require(event.eventVersion() == 2, "事件未提供已确认的计费决策，请核实源医嘱后重新投递");
        require(event.eventId() != null && event.eventId() > 0 && event.tenantId() != null && event.tenantId() > 0
                && event.aggregateId() != null && event.aggregateId() > 0 && event.occurredAt() != null
                && Objects.equals(event.aggregateType(), medication ? "MedicationRequest" : "ServiceRequest"), "事件身份或发生时间缺失");
        Map<String, Object> data = event.payload();
        require(data != null, "事件内容缺失");
        Long encounter = id(data, "encounterId", true, false);
        Long resident = id(data, "residentId", true, false);
        require(Objects.equals(resident, event.subjectId()), "事件患者与医嘱患者不一致");
        Long organization = id(data, "encounterOrganizationId", true, false);
        Long department = id(data, "encounterDepartmentId", true, false);
        Long author = id(data, "authoredBy", true, false);
        Long actor = cancellation ? id(data, "cancelledBy", true, false) : author;
        String decision = text(data, "billingDisposition", true);
        ClinicalOrderBillingDisposition disposition;
        try { disposition = ClinicalOrderBillingDisposition.valueOf(decision); }
        catch (IllegalArgumentException error) { throw unverified("计费决策不认识"); }
        boolean draft = disposition == ClinicalOrderBillingDisposition.DRAFT;
        require(!draft || medication && cancellation, "只有未提交药品草稿撤销可以不冲销收费");
        require(!medication || data.get("selfProvided") instanceof Boolean, "自备药事实缺失");
        boolean selfProvided = Boolean.TRUE.equals(data.get("selfProvided"));
        require(medication || !selfProvided, "诊疗项目不能声明为自备药");
        BigDecimal quantity = decimal(data, "chargeQuantity", true);
        require(quantity.signum() > 0, "计费数量无效");
        BigDecimal price = decimal(data, "unitPrice", false);
        BigDecimal total = decimal(data, "totalAmount", false);
        String currency = text(data, "currencyCode", false);
        require(disposition == ClinicalOrderBillingDisposition.fromSnapshot(draft, selfProvided, price, total, currency),
                "计费决策与价格或自备药事实不符");
        Long catalog = id(data, "catalogItemId", price != null, false);
        Long priceId = id(data, "priceId", price != null, false);
        Long priceRevision = id(data, "priceRevision", price != null, true);
        String priceType = text(data, "priceType", price != null);
        if (price != null) {
            require(money(price.multiply(quantity)).compareTo(money(total)) == 0, "数量、单价与金额不一致");
        } else {
            require(priceId == null && priceRevision == null && priceType == null, "未定价医嘱包含不完整的价格来源");
        }
        String requestNo = text(data, "requestNo", true);
        String prescriptionNo = text(data, "prescriptionNo", false);
        return new ClinicalOrderChargeFacts(encounter, resident, organization, department, catalog, author, actor,
                quantity, price == null ? null : money(price), total == null ? null : money(total), currency,
                priceId, priceRevision, priceType, text(data, "chargeUnit", true), text(data, "itemCode", true),
                text(data, "itemName", true), prescriptionNo == null ? requestNo : prescriptionNo,
                text(data, "accountingCategory", false), event.occurredAt().truncatedTo(ChronoUnit.MICROS), disposition);
    }

    void requireOriginal(ChargeItem original, DomainEventEnvelope event, boolean cancellation) {
        require(Objects.equals(original.tenantId(), event.tenantId())
                && Objects.equals(original.sourceId(), event.aggregateId())
                && Objects.equals(original.requestId(), event.aggregateId())
                && Objects.equals(original.encounterId(), encounterId)
                && Objects.equals(original.residentId(), residentId)
                && Objects.equals(original.organizationId(), organizationId)
                && Objects.equals(original.departmentId(), departmentId)
                && Objects.equals(original.catalogItemId(), catalogItemId)
                && Objects.equals(original.enteredBy(), authoredBy)
                && Objects.equals(original.requestCode(), requestNo)
                && Objects.equals(original.unitCode(), unitCode)
                && Objects.equals(original.itemCodeSnapshot(), itemCode)
                && Objects.equals(original.itemNameSnapshot(), itemName)
                && Objects.equals(original.priceId(), priceId)
                && Objects.equals(original.priceRevision(), priceRevision)
                && Objects.equals(original.priceType(), priceType)
                && Objects.equals(original.currencyCode(), currency)
                && original.quantity() != null && original.quantity().compareTo(quantity) == 0
                && sameNumber(original.unitPrice(), unitPrice)
                && sameNumber(original.totalAmount(), totalAmount)
                && original.reversesChargeItemId() == null && "POSTED".equals(original.status()), "原收费记录与医嘱事实不一致");
        if (!cancellation) {
            require(Objects.equals(original.accountingCategory(), accountingCategory)
                    && sameTime(original.occurredAt(), occurredAt), "重复计费事件的分类或发生时间与原记录不一致");
        }
    }

    static boolean sameNumber(BigDecimal left, BigDecimal right) {
        return left != null && right != null && money(left).compareTo(money(right)) == 0;
    }
    static boolean sameTime(Instant left, Instant right) {
        return left != null && right != null && left.truncatedTo(ChronoUnit.MICROS).equals(right.truncatedTo(ChronoUnit.MICROS));
    }
    static BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    static void require(boolean condition, String message) { if (!condition) throw unverified(message); }
    static BusinessException unverified(String reason) {
        return new BusinessException("CLINICAL_ORDER_BILLING_UNVERIFIED", "医嘱计费未确认：" + reason, HttpStatus.CONFLICT);
    }
    private static String text(Map<String, Object> data, String key, boolean required) {
        Object value = data.get(key);
        if (value == null && !required) return null;
        require(value instanceof String && !((String) value).isBlank(), key + "缺失或无效");
        return ((String) value).trim();
    }
    private static BigDecimal decimal(Map<String, Object> data, String key, boolean required) {
        Object value = data.get(key);
        if (value == null && !required) return null;
        require(value instanceof Number || value instanceof String, key + "缺失或无效");
        try { return new BigDecimal(value.toString()); }
        catch (NumberFormatException error) { throw unverified(key + "不是有效数值"); }
    }
    private static Long id(Map<String, Object> data, String key, boolean required, boolean zeroAllowed) {
        BigDecimal number = decimal(data, key, required);
        if (number == null) return null;
        try {
            long value = number.longValueExact();
            require(zeroAllowed ? value >= 0 : value > 0, key + "无效");
            return value;
        } catch (ArithmeticException error) { throw unverified(key + "不是有效整数标识"); }
    }
}
