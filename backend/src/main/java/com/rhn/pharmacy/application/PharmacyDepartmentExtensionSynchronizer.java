package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.organization.api.DepartmentExtensionSynchronizer;
import com.rhn.platform.organization.api.DepartmentView;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PharmacyDepartmentExtensionSynchronizer implements DepartmentExtensionSynchronizer {
    private static final Map<String, InventoryProfile> PROFILES = Map.of(
            "MED_PHARMACY_WAREHOUSE", new InventoryProfile("WAREHOUSE", "MIXED"),
            "MED_PHARMACY_OUTPATIENT", new InventoryProfile("PHARMACY", "OUTPATIENT"),
            "MED_PHARMACY_INPATIENT", new InventoryProfile("PHARMACY", "INPATIENT"),
            "MED_PHARMACY_EMERGENCY", new InventoryProfile("PHARMACY", "EMERGENCY"),
            "MED_PHARMACY_TCM", new InventoryProfile("PHARMACY", "MIXED"),
            "MED_PHARMACY_PREPARATION", new InventoryProfile("WAREHOUSE", "MIXED")
    );

    private final StockSiteRepository repository;

    public PharmacyDepartmentExtensionSynchronizer(StockSiteRepository repository) {
        this.repository = repository;
    }

    @Override
    public void synchronize(Long tenantId, DepartmentView department, Long actorId) {
        InventoryProfile profile = PROFILES.get(department.sdDepartmentType());
        StockSite existing = repository.findByTenantIdAndOrganizationIdAndDepartmentId(
                tenantId, department.organizationId(), department.id()).orElse(null);
        if (profile == null && existing == null) return;
        if (existing == null) {
            repository.saveAndFlush(new StockSite(tenantId, department.organizationId(), department.id(),
                    department.code(), department.name(), profile.siteType(), profile.serviceScope(),
                    department.validFrom(), department.validTo(), actorId));
            return;
        }
        InventoryProfile effectiveProfile = profile == null
                ? new InventoryProfile(existing.siteType(), existing.serviceScope()) : profile;
        existing.synchronizeDepartment(department.code(), department.name(), effectiveProfile.siteType(),
                effectiveProfile.serviceScope(), profile != null && "ACTIVE".equals(department.sdOrgStatus()),
                department.validFrom(), department.validTo(), actorId);
        repository.saveAndFlush(existing);
    }

    private record InventoryProfile(String siteType, String serviceScope) {}
}
