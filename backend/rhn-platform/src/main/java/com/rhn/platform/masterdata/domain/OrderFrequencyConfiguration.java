package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;

@Entity
@Table(name = "RHN_BD_ORDER_FREQ_CFG")
public class OrderFrequencyConfiguration {
    @Id @Column(name = "ID_ORDER_FREQ_CFG") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "CD_SCOPE_KEY", nullable = false) private String scopeKey;
    @Column(name = "ID_ORDER_FREQ", nullable = false) private Long frequencyId;
    @Column(name = "CD_LOCAL") private String localCode;
    @Column(name = "NA_LOCAL") private String localName;
    @Column(name = "EXEC_TIMES") private String executionTimes;
    @Column(name = "SD_FIRST_DAY_POLICY", nullable = false) private String firstDayPolicy;
    @Column(name = "FG_ENABLED", nullable = false) private boolean enabled;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected OrderFrequencyConfiguration() {}
    public OrderFrequencyConfiguration(Long tenantId, Long actorId, Long organizationId, Long departmentId,
            Long frequencyId, String localCode, String localName, String executionTimes,
            String firstDayPolicy, boolean enabled, String status, LocalDate validFrom, LocalDate validTo) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.scopeKey = scopeKey(organizationId, departmentId);
        this.frequencyId = frequencyId; this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, localCode, localName, executionTimes, firstDayPolicy, enabled, status, validFrom, validTo);
    }
    public void update(long expectedRevision, Long actorId, String localCode, String localName,
            String executionTimes, String firstDayPolicy, boolean enabled, String status,
            LocalDate validFrom, LocalDate validTo) {
        if (revision != expectedRevision) throw new IllegalStateException("频次执行配置已被其他用户修改，请刷新后重试");
        updateValues(actorId, localCode, localName, executionTimes, firstDayPolicy, enabled, status, validFrom, validTo);
    }
    private void updateValues(Long actorId, String localCode, String localName, String executionTimes,
            String firstDayPolicy, boolean enabled, String status, LocalDate validFrom, LocalDate validTo) {
        if (!Set.of("REMAINING_SLOTS", "FULL_SCHEDULE", "FROM_ORDER_TIME").contains(firstDayPolicy)) throw new IllegalArgumentException("首日执行策略不正确");
        if (!Set.of("ACTIVE", "INACTIVE").contains(status)) throw new IllegalArgumentException("配置状态不正确");
        if (validFrom == null || validTo != null && validTo.isBefore(validFrom)) throw new IllegalArgumentException("配置有效期不正确");
        this.localCode = trim(localCode); this.localName = trim(localName); this.executionTimes = trim(executionTimes);
        this.firstDayPolicy = firstDayPolicy; this.enabled = enabled; this.status = status;
        this.validFrom = validFrom; this.validTo = validTo; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }
    public boolean effective(LocalDate date) { return "ACTIVE".equals(status) && !validFrom.isAfter(date) && (validTo == null || !validTo.isBefore(date)); }
    public static String scopeKey(Long organizationId, Long departmentId) { return departmentId == null ? "ORG:" + organizationId : "DEPT:" + departmentId; }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; } public Long departmentId() { return departmentId; }
    public String scopeKey() { return scopeKey; } public Long frequencyId() { return frequencyId; }
    public String localCode() { return localCode; } public String localName() { return localName; }
    public String executionTimes() { return executionTimes; } public String firstDayPolicy() { return firstDayPolicy; }
    public boolean enabled() { return enabled; } public String status() { return status; }
    public LocalDate validFrom() { return validFrom; } public LocalDate validTo() { return validTo; }
}
