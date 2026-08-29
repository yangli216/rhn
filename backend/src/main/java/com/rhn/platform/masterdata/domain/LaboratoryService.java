package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "laboratory_services")
public class LaboratoryService {
    @Id @Column(name = "catalog_item_id") private Long catalogItemId;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "laboratory_method") private String laboratoryMethod;
    @Column(name = "report_duration") private BigDecimal reportDuration;
    @Column(name = "report_duration_unit") private String reportDurationUnit;
    @Column(name = "fasting_required", nullable = false) private boolean fastingRequired;
    @Column(name = "point_of_care", nullable = false) private boolean pointOfCare;
    @Column(name = "collection_description") private String collectionDescription;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

    protected LaboratoryService() {}

    public LaboratoryService(Long tenantId, Long catalogItemId, String collectionDescription) {
        this(tenantId, catalogItemId, null, null, null, false, false, collectionDescription, null);
    }

    public LaboratoryService(Long tenantId, Long catalogItemId, String laboratoryMethod,
                             BigDecimal reportDuration, String reportDurationUnit,
                             boolean fastingRequired, boolean pointOfCare,
                             String collectionDescription, Long actorId) {
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(laboratoryMethod, reportDuration, reportDurationUnit, fastingRequired,
                pointOfCare, collectionDescription, actorId);
    }

    public void synchronizeLegacy(String collectionDescription) {
        if (this.collectionDescription == null) this.collectionDescription = collectionDescription;
    }

    public void update(long expectedRevision, String laboratoryMethod, BigDecimal reportDuration,
                       String reportDurationUnit, boolean fastingRequired, boolean pointOfCare,
                       String collectionDescription, Long actorId) {
        requireRevision(expectedRevision);
        updateValues(laboratoryMethod, reportDuration, reportDurationUnit, fastingRequired,
                pointOfCare, collectionDescription, actorId);
    }

    private void updateValues(String laboratoryMethod, BigDecimal reportDuration, String reportDurationUnit,
                              boolean fastingRequired, boolean pointOfCare,
                              String collectionDescription, Long actorId) {
        if (reportDuration != null && reportDuration.signum() <= 0) {
            throw new IllegalArgumentException("报告时长必须大于0");
        }
        if ((reportDuration == null) != (reportDurationUnit == null || reportDurationUnit.isBlank())) {
            throw new IllegalArgumentException("报告时长和单位必须同时填写");
        }
        this.laboratoryMethod = laboratoryMethod;
        this.reportDuration = reportDuration;
        this.reportDurationUnit = reportDurationUnit;
        this.fastingRequired = fastingRequired;
        this.pointOfCare = pointOfCare;
        this.collectionDescription = collectionDescription;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long catalogItemId() { return catalogItemId; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public String laboratoryMethod() { return laboratoryMethod; }
    public BigDecimal reportDuration() { return reportDuration; }
    public String reportDurationUnit() { return reportDurationUnit; }
    public boolean fastingRequired() { return fastingRequired; }
    public boolean pointOfCare() { return pointOfCare; }
    public String collectionDescription() { return collectionDescription; }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("检验项目配置已被其他用户修改，请刷新后重试");
    }
}
