package com.rhn.platform.masterdata.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;
import java.time.Instant;

import com.rhn.shared.id.GlobalIds;

@Entity
@Table(name = "RHN_EX_LAB_SVC_SPEC")
public class LaboratoryServiceSpecimen {
    @Id @Column(name = "ID_LAB_SVC_SPEC") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_CATALOG_ITEM", nullable = false) private Long catalogItemId;
    @Column(name = "ID_DICT_ITEM_SPEC", nullable = false) private Long specimenItemId;
    @Column(name = "ID_DICT_ITEM_CONTAINER") private Long containerItemId;
    @Column(name = "QTY_MINIMUM") private BigDecimal minimumQuantity;
    @Column(name = "MINIMUM_QUANTITY_UNIT") private String minimumQuantityUnit;
    @Column(name = "FG_DEFAULT_SPEC", nullable = false) private boolean defaultSpecimen;
    @Column(name = "FG_REQUIRED_SPEC", nullable = false) private boolean requiredSpecimen;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;
    @Column(name = "DES_COLLECTION_DESCRIPTION") private String collectionDescription;
    @Column(name = "CD_TUBE_GRP") private String tubeGroupCode;
    @Column(name = "SD_TUBE_SHARING_MODE", nullable = false) private String tubeSharingMode;
    @Column(name = "QTY_BASE_TUBE", nullable = false) private int baseTubeCount;
    @Column(name = "QTY_MAX_TEST_PER_TUBE") private Integer maxTestsPerTube;
    @Column(name = "SD_TUBE_CHARGE_MODE", nullable = false) private String tubeChargeMode;
    @Column(name = "ID_CATALOG_ITEM_TUBE_CHARGE") private Long tubeChargeItemId;
    @Column(name = "QTY_INCLUDED_TUBE", nullable = false) private int includedTubeCount;
    @Column(name = "QTY_TUBE_CHARGE", nullable = false) private BigDecimal tubeChargeQuantity;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected LaboratoryServiceSpecimen() {}

    public LaboratoryServiceSpecimen(Long tenantId, Long catalogItemId, Long specimenItemId,
                                     Long containerItemId, BigDecimal minimumQuantity,
                                     String minimumQuantityUnit, boolean defaultSpecimen,
                                     boolean requiredSpecimen, int sortOrder,
                                     String collectionDescription, String status, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(specimenItemId, containerItemId, minimumQuantity, minimumQuantityUnit,
                defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                null, "SEPARATE", 1, null, "NONE", null, 0, BigDecimal.ONE, actorId);
    }

    public LaboratoryServiceSpecimen(Long tenantId, Long catalogItemId, Long specimenItemId,
                                     Long containerItemId, BigDecimal minimumQuantity,
                                     String minimumQuantityUnit, boolean defaultSpecimen,
                                     boolean requiredSpecimen, int sortOrder, String collectionDescription,
                                     String status, String tubeGroupCode, String tubeSharingMode,
                                     int baseTubeCount, Integer maxTestsPerTube, String tubeChargeMode,
                                     Long tubeChargeItemId, int includedTubeCount,
                                     BigDecimal tubeChargeQuantity, Long actorId) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.catalogItemId = catalogItemId;
        this.createdAt = Instant.now();
        this.createdBy = actorId;
        updateValues(specimenItemId, containerItemId, minimumQuantity, minimumQuantityUnit,
                defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                tubeGroupCode, tubeSharingMode, baseTubeCount, maxTestsPerTube, tubeChargeMode,
                tubeChargeItemId, includedTubeCount, tubeChargeQuantity, actorId);
    }

    public void update(long expectedRevision, Long specimenItemId, Long containerItemId,
                       BigDecimal minimumQuantity, String minimumQuantityUnit,
                       boolean defaultSpecimen, boolean requiredSpecimen, int sortOrder,
                       String collectionDescription, String status, Long actorId) {
        requireRevision(expectedRevision);
        updateValues(specimenItemId, containerItemId, minimumQuantity, minimumQuantityUnit,
                defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                tubeGroupCode, tubeSharingMode, baseTubeCount, maxTestsPerTube, tubeChargeMode,
                tubeChargeItemId, includedTubeCount, tubeChargeQuantity, actorId);
    }

    public void update(long expectedRevision, Long specimenItemId, Long containerItemId,
                       BigDecimal minimumQuantity, String minimumQuantityUnit,
                       boolean defaultSpecimen, boolean requiredSpecimen, int sortOrder,
                       String collectionDescription, String status, String tubeGroupCode,
                       String tubeSharingMode, int baseTubeCount, Integer maxTestsPerTube,
                       String tubeChargeMode, Long tubeChargeItemId, int includedTubeCount,
                       BigDecimal tubeChargeQuantity, Long actorId) {
        requireRevision(expectedRevision);
        updateValues(specimenItemId, containerItemId, minimumQuantity, minimumQuantityUnit,
                defaultSpecimen, requiredSpecimen, sortOrder, collectionDescription, status,
                tubeGroupCode, tubeSharingMode, baseTubeCount, maxTestsPerTube, tubeChargeMode,
                tubeChargeItemId, includedTubeCount, tubeChargeQuantity, actorId);
    }

    public void changeStatus(long expectedRevision, String status, Long actorId) {
        requireRevision(expectedRevision);
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    private void updateValues(Long specimenItemId, Long containerItemId, BigDecimal minimumQuantity,
                              String minimumQuantityUnit, boolean defaultSpecimen,
                              boolean requiredSpecimen, int sortOrder,
                              String collectionDescription, String status, String tubeGroupCode,
                              String tubeSharingMode, int baseTubeCount, Integer maxTestsPerTube,
                              String tubeChargeMode, Long tubeChargeItemId, int includedTubeCount,
                              BigDecimal tubeChargeQuantity, Long actorId) {
        if (minimumQuantity != null && minimumQuantity.signum() <= 0) {
            throw new IllegalArgumentException("最小采集量必须大于0");
        }
        if ((minimumQuantity == null) != (minimumQuantityUnit == null || minimumQuantityUnit.isBlank())) {
            throw new IllegalArgumentException("最小采集量和单位必须同时填写");
        }
        if (sortOrder < 0) throw new IllegalArgumentException("排序号不能小于0");
        if (baseTubeCount <= 0) throw new IllegalArgumentException("基础试管数必须大于0");
        if ("BY_TEST_COUNT".equals(tubeSharingMode) && (maxTestsPerTube == null || maxTestsPerTube <= 0)) {
            throw new IllegalArgumentException("按项目数分管时必须配置每管最大项目数");
        }
        if (!"BY_TEST_COUNT".equals(tubeSharingMode) && maxTestsPerTube != null) {
            throw new IllegalArgumentException("仅按项目数分管时允许配置每管最大项目数");
        }
        if (!"NONE".equals(tubeChargeMode) && tubeChargeItemId == null) {
            throw new IllegalArgumentException("启用试管加收时必须配置加收项目");
        }
        if (includedTubeCount < 0) throw new IllegalArgumentException("包含试管数不能小于0");
        if (tubeChargeQuantity == null || tubeChargeQuantity.signum() <= 0) {
            throw new IllegalArgumentException("试管加收数量必须大于0");
        }
        this.specimenItemId = specimenItemId;
        this.containerItemId = containerItemId;
        this.minimumQuantity = minimumQuantity;
        this.minimumQuantityUnit = minimumQuantityUnit;
        this.defaultSpecimen = defaultSpecimen;
        this.requiredSpecimen = requiredSpecimen;
        this.sortOrder = sortOrder;
        this.collectionDescription = collectionDescription;
        this.tubeGroupCode = tubeGroupCode;
        this.tubeSharingMode = tubeSharingMode;
        this.baseTubeCount = baseTubeCount;
        this.maxTestsPerTube = maxTestsPerTube;
        this.tubeChargeMode = tubeChargeMode;
        this.tubeChargeItemId = tubeChargeItemId;
        this.includedTubeCount = includedTubeCount;
        this.tubeChargeQuantity = tubeChargeQuantity;
        this.status = status;
        this.updatedAt = Instant.now();
        this.updatedBy = actorId;
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long catalogItemId() { return catalogItemId; }
    public Long specimenItemId() { return specimenItemId; }
    public Long containerItemId() { return containerItemId; }
    public BigDecimal minimumQuantity() { return minimumQuantity; }
    public String minimumQuantityUnit() { return minimumQuantityUnit; }
    public boolean defaultSpecimen() { return defaultSpecimen; }
    public boolean requiredSpecimen() { return requiredSpecimen; }
    public int sortOrder() { return sortOrder; }
    public String collectionDescription() { return collectionDescription; }
    public String status() { return status; }
    public String tubeGroupCode() { return tubeGroupCode; }
    public String tubeSharingMode() { return tubeSharingMode; }
    public int baseTubeCount() { return baseTubeCount; }
    public Integer maxTestsPerTube() { return maxTestsPerTube; }
    public String tubeChargeMode() { return tubeChargeMode; }
    public Long tubeChargeItemId() { return tubeChargeItemId; }
    public int includedTubeCount() { return includedTubeCount; }
    public BigDecimal tubeChargeQuantity() { return tubeChargeQuantity; }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("检验标本配置已被其他用户修改，请刷新后重试");
    }
}
