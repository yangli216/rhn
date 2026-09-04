package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_SUP_PHARM_FULFILL_AUTH")
public class PharmacyFulfillmentAuthorization {
    @Id @Column(name = "ID_PHARM_FULFILL_AUTH") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT") private Long departmentId;
    @Column(name = "ID_CARE_REQ_MED", nullable = false) private Long medicationRequestId;
    @Column(name = "ID_STL", nullable = false) private Long settlementId;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_READY", nullable = false) private Instant readyAt;
    @Column(name = "DT_INTAKE_STARTED") private Instant intakeStartedAt;
    @Column(name = "DT_REVOKED") private Instant revokedAt;
    @Column(name = "ID_DISP_ROUTE") private Long dispenseRouteId;
    @Column(name = "SN_DISP_ROUTE_VER") private Long dispenseRouteRevision;
    @Column(name = "ID_STOCK_SITE_ROUTED") private Long routedStockSiteId;
    @Column(name = "DT_ROUTED") private Instant routedAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;

    protected PharmacyFulfillmentAuthorization() {}

    public PharmacyFulfillmentAuthorization(Long tenantId, Long organizationId, Long departmentId,
                                              Long medicationRequestId, Long settlementId, Instant readyAt) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.medicationRequestId = medicationRequestId;
        this.settlementId = settlementId; this.status = "READY_FOR_INTAKE";
        this.readyAt = readyAt; this.updatedAt = readyAt;
    }

    public void startIntake(Instant occurredAt) {
        if (!"READY_FOR_INTAKE".equals(status)) return;
        status = "INTAKE_STARTED"; intakeStartedAt = occurredAt; updatedAt = occurredAt;
    }

    public void assignRoute(Long routeId, long routeRevision, Long stockSiteId, Instant occurredAt) {
        if (routedStockSiteId != null) return;
        dispenseRouteId = routeId; dispenseRouteRevision = routeRevision;
        routedStockSiteId = stockSiteId; routedAt = occurredAt; updatedAt = occurredAt;
    }

    public void revoke(boolean intakeExists, Instant occurredAt) {
        status = intakeExists ? "EXCEPTION" : "REVOKED";
        revokedAt = occurredAt; updatedAt = occurredAt;
    }

    public boolean allowsIntake() { return "READY_FOR_INTAKE".equals(status) || "INTAKE_STARTED".equals(status); }
    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long organizationId() { return organizationId; }
    public Long departmentId() { return departmentId; }
    public Long medicationRequestId() { return medicationRequestId; }
    public Long settlementId() { return settlementId; }
    public String status() { return status; }
    public Long dispenseRouteId() { return dispenseRouteId; }
    public Long dispenseRouteRevision() { return dispenseRouteRevision; }
    public Long routedStockSiteId() { return routedStockSiteId; }
    public Instant routedAt() { return routedAt; }
}
