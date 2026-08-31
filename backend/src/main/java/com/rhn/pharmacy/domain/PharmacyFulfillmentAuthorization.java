package com.rhn.pharmacy.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "pharmacy_fulfillment_authorizations")
public class PharmacyFulfillmentAuthorization {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "organization_id", nullable = false) private Long organizationId;
    @Column(name = "department_id") private Long departmentId;
    @Column(name = "medication_request_id", nullable = false) private Long medicationRequestId;
    @Column(name = "settlement_id", nullable = false) private Long settlementId;
    @Column(nullable = false) private String status;
    @Column(name = "ready_at", nullable = false) private Instant readyAt;
    @Column(name = "intake_started_at") private Instant intakeStartedAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "dispense_route_id") private Long dispenseRouteId;
    @Column(name = "dispense_route_revision") private Long dispenseRouteRevision;
    @Column(name = "routed_stock_site_id") private Long routedStockSiteId;
    @Column(name = "routed_at") private Instant routedAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

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
