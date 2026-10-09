package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.UnitDefinitionDirectory;
import com.rhn.platform.masterdata.infrastructure.UnitDefinitionRepository;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import com.rhn.platform.masterdata.domain.UnitDefinition;

@Service
public class JpaUnitDefinitionDirectory implements UnitDefinitionDirectory {
    private final UnitDefinitionRepository repository;

    public JpaUnitDefinitionDirectory(UnitDefinitionRepository repository) {
        this.repository = repository;
    }

    @Override
    public Optional<UnitDefinitionSnapshot> findByCode(Long tenantId, String code) {
        if (tenantId == null || code == null || code.isBlank()) return Optional.empty();
        return repository.findByTenantIdAndCode(tenantId, code.trim().toUpperCase(Locale.ROOT))
                .map(value -> new UnitDefinitionSnapshot(value.code(), value.name(), value.decimalScale(), value.status()));
    }

    @Override
    public Map<String, String> resolveNames(Long tenantId, Set<String> codes) {
        if (tenantId == null || codes == null || codes.isEmpty()) return Map.of();
        Set<String> normalized = codes.stream().filter(code -> code != null && !code.isBlank())
                .map(code -> code.trim().toUpperCase(Locale.ROOT)).collect(Collectors.toSet());
        if (normalized.isEmpty()) return Map.of();
        return repository.findByTenantIdAndCodeIn(tenantId, normalized).stream()
                .collect(Collectors.toUnmodifiableMap(UnitDefinition::code, UnitDefinition::name));
    }
}
