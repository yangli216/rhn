package com.rhn.platform.masterdata.api;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Runtime directory for controlled medication administration routes. */
public interface MedicationRouteDirectory {
    RouteSnapshot requireActive(Long tenantId, String codeOrAlias, String scene, LocalDate businessDate);

    Optional<RouteSnapshot> resolveActive(Long tenantId, String codeOrAlias, String scene, LocalDate businessDate);

    List<RouteSnapshot> active(Long tenantId, String scene, LocalDate businessDate);

    record RouteSnapshot(Long id, String code, String name, String systemCode, String systemVersion,
                         String executionType) {
        public boolean requiresTreatmentExecution() {
            return !"NONE".equals(executionType);
        }

        public boolean infusion() {
            return "INFUSION".equals(executionType);
        }
    }
}
