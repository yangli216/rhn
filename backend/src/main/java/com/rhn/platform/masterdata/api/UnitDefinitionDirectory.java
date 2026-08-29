package com.rhn.platform.masterdata.api;

import java.util.Optional;

/**
 * Read-only contract for business modules that need the governed precision of a unit code.
 */
public interface UnitDefinitionDirectory {
    Optional<UnitDefinitionSnapshot> findByCode(Long tenantId, String code);

    record UnitDefinitionSnapshot(String code, int decimalScale, String status) {}
}
