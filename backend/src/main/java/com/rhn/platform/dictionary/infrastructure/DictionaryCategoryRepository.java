package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryCategory;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DictionaryCategoryRepository extends JpaRepository<DictionaryCategory, Long> {
    boolean existsByScopeCodeAndCode(String scopeCode, String code);

    List<DictionaryCategory> findByScopeTypeOrTenantIdOrderBySortOrderAscNameAsc(
            DictionaryScopeType scopeType, Long tenantId);

    @Query("""
            select category from DictionaryCategory category
            where category.id = :id
              and (category.scopeType = com.rhn.platform.dictionary.domain.DictionaryScopeType.PLATFORM
                   or category.tenantId = :tenantId)
            """)
    Optional<DictionaryCategory> findVisibleById(Long id, Long tenantId);

    boolean existsByParentIdAndStatus(Long parentId, DictionaryStatus status);
}

