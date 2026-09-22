package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_MFR")
public class Manufacturer {
    @Id @Column(name = "ID_MFR") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_MFR", nullable = false) private String code;
    @Column(name = "NA_MFR", nullable = false) private String name;
    @Column(name = "NA_SHORT") private String shortName;
    @Column(name = "SD_MFR_TYPE", nullable = false) private String manufacturerType;
    @Column(name = "PROD_PLACE") private String productionPlace;
    @Column(name = "CD_COUNTRY") private String countryCode;
    @Column(name = "DES_ADDR") private String address;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED") private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED") private Long updatedBy;

    protected Manufacturer() {}

    public Manufacturer(Long tenantId, Long actorId, String code, String name, String shortName,
                        String manufacturerType, String productionPlace, String countryCode,
                        String address, String status) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.code = code; this.name = name;
        this.shortName = shortName; this.manufacturerType = manufacturerType;
        this.productionPlace = productionPlace; this.countryCode = countryCode;
        this.address = address; this.status = status; this.createdAt = Instant.now(); this.createdBy = actorId;
        this.updatedAt = this.createdAt; this.updatedBy = actorId;
    }

    public void update(long expectedRevision, Long actorId, String code, String name, String shortName,
                       String manufacturerType, String productionPlace, String countryCode,
                       String address, String status) {
        requireRevision(expectedRevision);
        this.code = code; this.name = name; this.shortName = shortName;
        this.manufacturerType = manufacturerType; this.productionPlace = productionPlace;
        this.countryCode = countryCode; this.address = address; this.status = status;
        this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision);
        this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalStateException("生产企业已被其他用户修改，请刷新后重试");
    }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public String code() { return code; } public String name() { return name; } public String shortName() { return shortName; }
    public String manufacturerType() { return manufacturerType; } public String productionPlace() { return productionPlace; }
    public String countryCode() { return countryCode; }
    public String address() { return address; } public String status() { return status; }
}
