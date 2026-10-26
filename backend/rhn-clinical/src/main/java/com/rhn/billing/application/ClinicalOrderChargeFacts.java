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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Validated immutable facts from the version 2 clinical billing event contract. lines 为逐行收费明细：
 * 检查申请按收费方案提供 chargeLines 时多行，其余医嘱由顶层价格事实合成单行；未定价医嘱为空。
 */
record ClinicalOrderChargeFacts(Long encounterId, Long residentId, Long organizationId, Long departmentId,
                                Long catalogItemId, Long authoredBy, Long actorId, BigDecimal quantity,
                                BigDecimal unitPrice, BigDecimal totalAmount, String currency, Long priceId,
                                Long priceRevision, String priceType, String unitCode, String itemCode,
                                String itemName, String requestNo, String accountingCategory, Instant occurredAt,
                                ClinicalOrderBillingDisposition disposition, List<String> bodySiteCodes,
                                List<Line> lines) {

    /** 一条收费明细；role 为空表示单行医嘱。多部位固定加收没有价格版本，金额取检查配置。 */
    record Line(int lineNo, String role, Long catalogItemId, String itemCode, String itemName, String unitCode,
                BigDecimal quantity, BigDecimal unitPrice, BigDecimal totalAmount, Long priceId, Long priceRevision,
                String priceType, String accountingCategory) {
        boolean baseService() { return role == null || "BASE_SERVICE".equals(role); }
        /** 主收费行：单行医嘱、主项目（含主收费物价项）或阶梯档位。 */
        boolean mainLine() { return baseService() || "TIER".equals(role); }
    }

    private static final java.util.Set<String> LINE_ROLES = java.util.Set.of(
            "BASE_SERVICE", "TIER", "MULTI_SITE_FIXED", "MULTI_SITE_ITEM", "ATTACHMENT");
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
        require(!draft || cancellation, "只有未开立医嘱草稿撤销可以不冲销收费");
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
        boolean multiLine = data.get("chargeLines") != null;
        require(!multiLine || (!medication && price != null), "只有已定价的诊疗项目可以提供收费明细");
        if (price != null && !multiLine) {
            require(money(price.multiply(quantity)).compareTo(money(total)) == 0, "数量、单价与金额不一致");
        } else if (price != null) {
            require(money(price).signum() >= 0, "主项目单价无效");
        } else {
            require(priceId == null && priceRevision == null && priceType == null, "未定价医嘱包含不完整的价格来源");
        }
        String requestNo = text(data, "requestNo", !medication);
        if (requestNo == null) requestNo = "MEDICATION_REQUEST:" + event.aggregateId();
        String prescriptionNo = text(data, "prescriptionNo", false);
        String unit = text(data, "chargeUnit", true);
        String code = text(data, "itemCode", true);
        String name = text(data, "itemName", true);
        String category = text(data, "accountingCategory", false);
        List<Line> lines;
        if (multiLine) {
            lines = chargeLines(data, catalog, quantity, money(price), priceId, priceRevision, priceType, unit, code, name);
            require(money(lines.stream().map(Line::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add))
                    .compareTo(money(total)) == 0, "收费明细合计与医嘱金额不一致");
        } else {
            lines = price == null ? List.of() : List.of(new Line(1, null, catalog, code, name, unit, quantity,
                    money(price), money(total), priceId, priceRevision, priceType, category));
        }
        return new ClinicalOrderChargeFacts(encounter, resident, organization, department, catalog, author, actor,
                quantity, price == null ? null : money(price), total == null ? null : money(total), currency,
                priceId, priceRevision, priceType, unit, code, name, prescriptionNo == null ? requestNo : prescriptionNo,
                category, event.occurredAt().truncatedTo(ChronoUnit.MICROS), disposition, bodySiteCodes(data), lines);
    }

    /**
     * 收费明细：行号从 1 连续，首行为主收费行（主项目或阶梯档位），其价格来源与医嘱顶层价格一致；首行就是开立项目时
     * 项目、单位与数量也须一致。主收费行不是开立项目时允许只有一行，否则至少两行。除多部位固定加收外每行须有价格版本，
     * 且单价乘数量等于金额。
     */
    private static List<Line> chargeLines(Map<String, Object> data, Long catalog, BigDecimal quantity, BigDecimal price,
                                          Long priceId, Long priceRevision, String priceType, String unit,
                                          String code, String name) {
        require(data.get("chargeLines") instanceof List<?> values && !values.isEmpty(), "chargeLines缺失或无效");
        List<Line> lines = new ArrayList<>();
        for (Object value : (List<?>) data.get("chargeLines")) {
            require(value instanceof Map<?, ?>, "chargeLines缺失或无效");
            @SuppressWarnings("unchecked") Map<String, Object> row = (Map<String, Object>) value;
            String role = text(row, "role", true);
            require(LINE_ROLES.contains(role), "收费行类型不认识");
            boolean fixed = "MULTI_SITE_FIXED".equals(role);
            BigDecimal lineNo = decimal(row, "lineNo", true);
            require(lineNo.compareTo(BigDecimal.valueOf(lines.size() + 1)) == 0, "收费行号必须从 1 连续");
            BigDecimal lineQuantity = decimal(row, "quantity", true);
            BigDecimal linePrice = decimal(row, "unitPrice", true);
            BigDecimal lineTotal = decimal(row, "totalAmount", true);
            require(lineQuantity.signum() > 0 && linePrice.signum() >= 0 && lineTotal.signum() >= 0, "收费明细数量或金额无效");
            Long linePriceId = id(row, "priceId", !fixed, false);
            Long lineRevision = id(row, "priceRevision", !fixed, true);
            String linePriceType = text(row, "priceType", !fixed);
            require(!fixed || (linePriceId == null && lineRevision == null && linePriceType == null), "固定加收不能带价格版本");
            if (!fixed) {
                require(money(linePrice.multiply(lineQuantity)).compareTo(money(lineTotal)) == 0, "收费明细数量、单价与金额不一致");
            }
            lines.add(new Line(lines.size() + 1, role, id(row, "catalogItemId", true, false), text(row, "itemCode", true),
                    text(row, "itemName", true), text(row, "chargeUnit", true), lineQuantity, money(linePrice),
                    money(lineTotal), linePriceId, lineRevision, linePriceType, text(row, "accountingCategory", false)));
        }
        Line main = lines.getFirst();
        boolean self = "BASE_SERVICE".equals(main.role()) && Objects.equals(main.catalogItemId(), catalog);
        require(main.role() != null && main.mainLine() && lines.stream().skip(1).noneMatch(Line::mainLine)
                && (lines.size() > 1 || !self), "收费明细缺少主收费行或行数无效");
        require(main.unitPrice().compareTo(price) == 0 && Objects.equals(main.priceId(), priceId)
                && Objects.equals(main.priceRevision(), priceRevision) && Objects.equals(main.priceType(), priceType)
                && (!self || Objects.equals(main.itemCode(), code) && Objects.equals(main.itemName(), name)
                        && Objects.equals(main.unitCode(), unit) && main.quantity().compareTo(quantity) == 0),
                "主收费行与医嘱价格事实不一致");
        return List.copyOf(lines);
    }

    void requireOriginal(ChargeItem original, Line line, DomainEventEnvelope event, boolean cancellation) {
        require(Objects.equals(original.tenantId(), event.tenantId())
                && original.chargeLineNo() == line.lineNo() && Objects.equals(original.chargeRole(), line.role())
                && Objects.equals(original.sourceId(), event.aggregateId())
                && Objects.equals(original.requestId(), event.aggregateId())
                && Objects.equals(original.encounterId(), encounterId)
                && Objects.equals(original.residentId(), residentId)
                && Objects.equals(original.organizationId(), organizationId)
                && Objects.equals(original.departmentId(), departmentId)
                && Objects.equals(original.catalogItemId(), line.catalogItemId())
                && Objects.equals(original.enteredBy(), authoredBy)
                && Objects.equals(original.requestCode(), requestNo)
                && Objects.equals(original.unitCode(), line.unitCode())
                && Objects.equals(original.itemCodeSnapshot(), line.itemCode())
                && Objects.equals(original.itemNameSnapshot(), line.itemName())
                && Objects.equals(original.priceId(), line.priceId())
                && Objects.equals(original.priceRevision(), line.priceRevision())
                && Objects.equals(original.priceType(), line.priceType())
                && Objects.equals(original.currencyCode(), currency)
                && original.quantity() != null && original.quantity().compareTo(line.quantity()) == 0
                && sameNumber(original.unitPrice(), line.unitPrice())
                && sameNumber(original.totalAmount(), line.totalAmount())
                && original.reversesChargeItemId() == null && "POSTED".equals(original.status()), "原收费记录与医嘱事实不一致");
        if (!cancellation) {
            require(Objects.equals(original.accountingCategory(), line.accountingCategory())
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
    /** 检查申请所选部位编码，按选择顺序；未选部位或药品为空。 */
    private static List<String> bodySiteCodes(Map<String, Object> data) {
        Object value = data.get("bodySites");
        if (value == null) return List.of();
        require(value instanceof List<?>, "bodySites缺失或无效");
        List<String> codes = new ArrayList<>();
        for (Object site : (List<?>) value) {
            require(site instanceof Map<?, ?> map && map.get("code") instanceof String code && !code.isBlank(), "bodySites缺失或无效");
            codes.add(((String) ((Map<?, ?>) site).get("code")).trim());
        }
        return List.copyOf(codes);
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
