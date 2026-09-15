package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

@Entity
@Table(name = "RHN_BD_ORDER_FREQ")
public class OrderFrequency {
    private static final Set<String> RULE_TYPES = Set.of("ONCE", "TIMES_PER_PERIOD", "FIXED_INTERVAL", "CALENDAR", "PRN", "CONTINUOUS");
    private static final Set<String> ANCHOR_TYPES = Set.of("ORDER_START", "STANDARD_TIME", "CALENDAR", "EVENT");
    private static final Set<String> PERIOD_UNITS = Set.of("MIN", "H", "D", "WK", "MO");
    @Id @Column(name = "ID_ORDER_FREQ") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_ORDER_FREQ", nullable = false) private String code;
    @Column(name = "NA_ORDER_FREQ", nullable = false) private String name;
    @Column(name = "NA_SHORT") private String shortName;
    @Column(name = "DES_ORDER_FREQ") private String description;
    @Column(name = "SD_RULE_TYPE", nullable = false) private String ruleType;
    @Column(name = "QTY_FREQ") private Integer frequencyCount;
    @Column(name = "QTY_PERIOD_VAL", precision = 12, scale = 3) private BigDecimal periodValue;
    @Column(name = "PERIOD_UNIT") private String periodUnit;
    @Column(name = "SD_ANCHOR_TYPE", nullable = false) private String anchorType;
    @Column(name = "DEFAULT_EXECUTION_TIMES") private String defaultExecutionTimes;
    @Column(name = "FG_OP_APPLICABLE", nullable = false) private boolean outpatientApplicable;
    @Column(name = "FG_INP_APPLICABLE", nullable = false) private boolean inpatientApplicable;
    @Column(name = "FG_EMERGENCY_APPLICABLE", nullable = false) private boolean emergencyApplicable;
    @Column(name = "FG_MED_APPLICABLE", nullable = false) private boolean medicationApplicable;
    @Column(name = "FG_TREAT_APPLICABLE", nullable = false) private boolean treatmentApplicable;
    @Column(name = "FG_NURS_APPLICABLE", nullable = false) private boolean nursingApplicable;
    @Column(name = "FG_AUTOMATIC_TASK_GEN", nullable = false) private boolean automaticTaskGeneration;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected OrderFrequency() {}

    public OrderFrequency(Long tenantId, Long actorId, String code, String name, String shortName,
            String description, String ruleType, Integer frequencyCount, BigDecimal periodValue,
            String periodUnit, String anchorType, String defaultExecutionTimes,
            boolean outpatientApplicable, boolean inpatientApplicable, boolean emergencyApplicable,
            boolean medicationApplicable, boolean treatmentApplicable, boolean nursingApplicable,
            boolean automaticTaskGeneration, int sortOrder, String status,
            LocalDate validFrom, LocalDate validTo) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.code = require(code, "频次编码").toUpperCase();
        this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, name, shortName, description, ruleType, frequencyCount, periodValue,
                periodUnit, anchorType, defaultExecutionTimes, outpatientApplicable, inpatientApplicable,
                emergencyApplicable, medicationApplicable, treatmentApplicable, nursingApplicable,
                automaticTaskGeneration, sortOrder, status, validFrom, validTo);
    }

    public void update(long expectedRevision, Long actorId, String name, String shortName,
            String description, String ruleType, Integer frequencyCount, BigDecimal periodValue,
            String periodUnit, String anchorType, String defaultExecutionTimes,
            boolean outpatientApplicable, boolean inpatientApplicable, boolean emergencyApplicable,
            boolean medicationApplicable, boolean treatmentApplicable, boolean nursingApplicable,
            boolean automaticTaskGeneration, int sortOrder, String status,
            LocalDate validFrom, LocalDate validTo) {
        if (revision != expectedRevision) throw new IllegalStateException("医嘱频次已被其他用户修改，请刷新后重试");
        updateValues(actorId, name, shortName, description, ruleType, frequencyCount, periodValue,
                periodUnit, anchorType, defaultExecutionTimes, outpatientApplicable, inpatientApplicable,
                emergencyApplicable, medicationApplicable, treatmentApplicable, nursingApplicable,
                automaticTaskGeneration, sortOrder, status, validFrom, validTo);
    }

    private void updateValues(Long actorId, String name, String shortName, String description,
            String ruleType, Integer frequencyCount, BigDecimal periodValue, String periodUnit,
            String anchorType, String defaultExecutionTimes, boolean outpatientApplicable,
            boolean inpatientApplicable, boolean emergencyApplicable, boolean medicationApplicable,
            boolean treatmentApplicable, boolean nursingApplicable, boolean automaticTaskGeneration,
            int sortOrder, String status, LocalDate validFrom, LocalDate validTo) {
        if (!RULE_TYPES.contains(ruleType)) throw new IllegalArgumentException("不支持的频次规则类型");
        if (!ANCHOR_TYPES.contains(anchorType)) throw new IllegalArgumentException("不支持的频次锚点类型");
        if (periodUnit != null && !PERIOD_UNITS.contains(periodUnit)) throw new IllegalArgumentException("不支持的频次周期单位");
        if (frequencyCount != null && frequencyCount <= 0) throw new IllegalArgumentException("周期执行次数必须大于0");
        if (periodValue != null && periodValue.signum() <= 0) throw new IllegalArgumentException("频次周期必须大于0");
        if (Set.of("TIMES_PER_PERIOD", "FIXED_INTERVAL").contains(ruleType)
                && (frequencyCount == null || periodValue == null || periodUnit == null)) {
            throw new IllegalArgumentException("周期频次必须配置次数、周期值和周期单位");
        }
        if ("TIMES_PER_PERIOD".equals(ruleType) && "STANDARD_TIME".equals(anchorType)
                && trim(defaultExecutionTimes) == null) throw new IllegalArgumentException("标准时点频次必须配置默认执行时间");
        if (validFrom == null || validTo != null && validTo.isBefore(validFrom)) throw new IllegalArgumentException("频次有效期不正确");
        if (!Set.of("ACTIVE", "INACTIVE").contains(status)) throw new IllegalArgumentException("频次状态不正确");
        this.name = require(name, "频次名称"); this.shortName = trim(shortName); this.description = trim(description);
        this.ruleType = ruleType; this.frequencyCount = frequencyCount; this.periodValue = periodValue;
        this.periodUnit = periodUnit; this.anchorType = anchorType; this.defaultExecutionTimes = trim(defaultExecutionTimes);
        this.outpatientApplicable = outpatientApplicable; this.inpatientApplicable = inpatientApplicable;
        this.emergencyApplicable = emergencyApplicable; this.medicationApplicable = medicationApplicable;
        this.treatmentApplicable = treatmentApplicable; this.nursingApplicable = nursingApplicable;
        this.automaticTaskGeneration = automaticTaskGeneration; this.sortOrder = sortOrder;
        this.status = status; this.validFrom = validFrom; this.validTo = validTo;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public boolean effective(LocalDate date) { return "ACTIVE".equals(status) && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date)); }
    public boolean applicable(String scene, String orderType) {
        boolean sceneAllowed = switch (scene) { case "OUTPATIENT" -> outpatientApplicable; case "INPATIENT" -> inpatientApplicable; case "EMERGENCY" -> emergencyApplicable; default -> false; };
        boolean orderAllowed = switch (orderType) { case "MEDICATION" -> medicationApplicable; case "TREATMENT" -> treatmentApplicable; case "NURSING" -> nursingApplicable; default -> false; };
        return sceneAllowed && orderAllowed;
    }
    private static String require(String value, String label) { if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空"); return value.trim(); }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public String code() { return code; } public String name() { return name; } public String shortName() { return shortName; }
    public String description() { return description; } public String ruleType() { return ruleType; }
    public Integer frequencyCount() { return frequencyCount; } public BigDecimal periodValue() { return periodValue; }
    public String periodUnit() { return periodUnit; } public String anchorType() { return anchorType; }
    public String defaultExecutionTimes() { return defaultExecutionTimes; }
    public boolean outpatientApplicable() { return outpatientApplicable; } public boolean inpatientApplicable() { return inpatientApplicable; }
    public boolean emergencyApplicable() { return emergencyApplicable; } public boolean medicationApplicable() { return medicationApplicable; }
    public boolean treatmentApplicable() { return treatmentApplicable; } public boolean nursingApplicable() { return nursingApplicable; }
    public boolean automaticTaskGeneration() { return automaticTaskGeneration; } public int sortOrder() { return sortOrder; }
    public String status() { return status; } public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
}
