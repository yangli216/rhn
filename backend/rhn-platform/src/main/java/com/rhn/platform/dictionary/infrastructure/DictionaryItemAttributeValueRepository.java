package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryItemAttributeValue;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DictionaryItemAttributeValueRepository extends JpaRepository<DictionaryItemAttributeValue, Long> {
    List<DictionaryItemAttributeValue> findByDictionaryItemIdAndAttributeDefinitionIdAndStatusOrderByValueOrderAsc(
            Long dictionaryItemId, Long attributeDefinitionId, DictionaryStatus status);
    List<DictionaryItemAttributeValue> findByDictionaryItemIdAndAttributeDefinitionIdAndScopeCodeAndStatusOrderByValueOrderAsc(
            Long dictionaryItemId, Long attributeDefinitionId, String scopeCode, DictionaryStatus status);
    List<DictionaryItemAttributeValue> findByDictionaryItemIdInAndAttributeDefinitionIdAndStatusOrderByDictionaryItemIdAscValueOrderAsc(
            Collection<Long> dictionaryItemIds, Long attributeDefinitionId, DictionaryStatus status);
    List<DictionaryItemAttributeValue> findByDictionaryItemIdInAndStatusOrderByDictionaryItemIdAscAttributeDefinitionIdAscValueOrderAsc(
            Collection<Long> dictionaryItemIds, DictionaryStatus status);
    void deleteByDictionaryItemIdAndAttributeDefinitionIdAndScopeCode(
            Long dictionaryItemId, Long attributeDefinitionId, String scopeCode);
    boolean existsByAttributeDefinitionId(Long attributeDefinitionId);
}
