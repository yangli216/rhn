package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "RHN_BD_ITEM_TERM_MAP")
public class ItemTermMapping {
    @Id @Column(name = "ID_ITEM_TERM_MAP") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ITEM_ATTR_SUBJECT", nullable = false) private Long attributeSubjectId;
    @Column(name = "ID_CONCEPT", nullable = false) private Long conceptId;
    @Column(name = "SD_MAP_TYPE", nullable = false) private String mappingType;
    @Column(name = "SD_EQUIV", nullable = false) private String equivalence;
    @Column(name = "FG_PRIMARY_MAP", nullable = false) private boolean primaryMapping;
    @Column(name = "DES_LIMIT") private String limitation;
    @Column(name = "DA_VALID_FROM", nullable = false) private LocalDate validFrom;
    @Column(name = "DA_VALID_TO") private LocalDate validTo;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_ITEM_TERM_MAP_RPLCS") private Long replacesMappingId;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ItemTermMapping() {}

    public ItemTermMapping(Long tenantId, Long attributeSubjectId, Long conceptId, String mappingType,
                           String equivalence, boolean primaryMapping, String limitation,
                           LocalDate validFrom, LocalDate validTo, Long replacesMappingId, Long actorId) {
        requirePeriod(validFrom, validTo);
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.attributeSubjectId = attributeSubjectId;
        this.conceptId = conceptId;
        this.mappingType = mappingType;
        this.equivalence = equivalence;
        this.primaryMapping = primaryMapping;
        this.limitation = limitation;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.status = "ACTIVE";
        this.replacesMappingId = replacesMappingId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        this.updatedAt = this.createdAt;
        this.updatedBy = actorId;
    }

    public void changeStatus(long expectedRevision, String status, LocalDate validTo, Long actorId) {
        requireRevision(expectedRevision);
        requirePeriod(validFrom, validTo);
        if (!java.util.Set.of("ACTIVE", "SUSPENDED", "RETIRED").contains(status)) {
            throw new IllegalArgumentException("映射状态只允许启用、暂停或停用");
        }
        if ("RETIRED".equals(status) && validTo == null) {
            throw new IllegalArgumentException("停用映射必须指定失效日期");
        }
        this.status = status;
        this.validTo = validTo;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public void supersede(long expectedRevision, LocalDate replacementFrom, Long actorId) {
        requireRevision(expectedRevision);
        if (!replacementFrom.isAfter(validFrom)) {
            throw new IllegalArgumentException("替代映射的生效日期必须晚于原映射");
        }
        this.status = "SUPERSEDED";
        this.validTo = replacementFrom.minusDays(1);
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public boolean effectiveAt(LocalDate date) {
        return !"SUSPENDED".equals(status) && !validFrom.isAfter(date)
                && (validTo == null || !validTo.isBefore(date));
    }

    public boolean overlaps(LocalDate from, LocalDate to) {
        return (validTo == null || !validTo.isBefore(from)) && (to == null || !to.isBefore(validFrom));
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("标准映射已被其他用户修改，请刷新后重试");
    }

    private static void requirePeriod(LocalDate from, LocalDate to) {
        if (from == null || (to != null && to.isBefore(from))) {
            throw new IllegalArgumentException("映射失效日期不能早于生效日期");
        }
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long attributeSubjectId() { return attributeSubjectId; }
    public Long conceptId() { return conceptId; }
    public String mappingType() { return mappingType; }
    public String equivalence() { return equivalence; }
    public boolean primaryMapping() { return primaryMapping; }
    public String limitation() { return limitation; }
    public LocalDate validFrom() { return validFrom; }
    public LocalDate validTo() { return validTo; }
    public String status() { return status; }
    public Long replacesMappingId() { return replacesMappingId; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public Long updatedBy() { return updatedBy; }
}
