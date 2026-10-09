package com.rhn.platform.masterdata.api;

import java.util.Optional;
import java.util.Map;
import java.util.Set;

/**
 * Read-only contract for business modules that need the governed precision of a unit code.
 */
public interface UnitDefinitionDirectory {
    Optional<UnitDefinitionSnapshot> findByCode(Long tenantId, String code);

    /** Display lookup includes inactive units used by historical facts; missing codes stay unresolved. */
    Map<String, String> resolveNames(Long tenantId, Set<String> codes);

    record UnitDefinitionSnapshot(String code, String name, int decimalScale, String status) {}
}
