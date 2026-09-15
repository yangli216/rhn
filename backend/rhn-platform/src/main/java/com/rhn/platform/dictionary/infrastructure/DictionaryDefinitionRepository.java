package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryDefinition;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DictionaryDefinitionRepository extends JpaRepository<DictionaryDefinition, Long> {
    boolean existsByScopeCodeAndCode(String scopeCode, String code);
    long countByCategoryId(Long categoryId);
    boolean existsByCategoryIdAndStatus(Long categoryId, com.rhn.platform.dictionary.domain.DictionaryStatus status);

    List<DictionaryDefinition> findByScopeTypeOrTenantIdOrderByUpdatedAtDesc(
            DictionaryScopeType scopeType, Long tenantId);

    @Query("""
            select definition from DictionaryDefinition definition
            where definition.id = :id
              and (definition.scopeType = com.rhn.platform.dictionary.domain.DictionaryScopeType.PLATFORM
                   or definition.tenantId = :tenantId)
            """)
    Optional<DictionaryDefinition> findVisibleById(Long id, Long tenantId);

    Optional<DictionaryDefinition> findByTenantIdAndCode(Long tenantId, String code);

    Optional<DictionaryDefinition> findByScopeTypeAndCode(DictionaryScopeType scopeType, String code);
}
