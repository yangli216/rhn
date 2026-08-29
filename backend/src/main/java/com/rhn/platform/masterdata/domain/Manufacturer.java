package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "manufacturers")
public class Manufacturer {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(nullable = false) private String code;
    @Column(nullable = false) private String name;
    @Column(name = "short_name") private String shortName;
    @Column(name = "manufacturer_type", nullable = false) private String manufacturerType;
    @Column(name = "production_place") private String productionPlace;
    @Column(name = "country_code") private String countryCode;
    private String address;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by") private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by") private Long updatedBy;

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

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public String code() { return code; } public String name() { return name; } public String shortName() { return shortName; }
    public String manufacturerType() { return manufacturerType; } public String productionPlace() { return productionPlace; }
    public String countryCode() { return countryCode; }
    public String address() { return address; } public String status() { return status; }
}
