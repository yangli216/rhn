package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.UnitDefinitionDirectory;
import com.rhn.platform.masterdata.infrastructure.UnitDefinitionRepository;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Optional;

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
                .map(value -> new UnitDefinitionSnapshot(value.code(), value.decimalScale(), value.status()));
    }
}
