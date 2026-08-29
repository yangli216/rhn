package com.rhn.platform.masterdata.api;

import java.time.LocalDate;

/** Minimal service item contract available to scheduling and other business modules. */
public interface ServiceCatalogDirectory {
    ServiceCatalogSnapshot requireActiveService(Long tenantId, Long catalogItemId, LocalDate businessDate);

    record ServiceCatalogSnapshot(Long id, String code, String name, String unitCode,
                                  String serviceType, LocalDate validFrom, LocalDate validTo) {}
}
