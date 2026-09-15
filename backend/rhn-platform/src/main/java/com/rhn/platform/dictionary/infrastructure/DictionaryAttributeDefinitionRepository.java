package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryAttributeDefinition;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DictionaryAttributeDefinitionRepository extends JpaRepository<DictionaryAttributeDefinition, Long> {
    boolean existsByDictionaryIdAndCode(Long dictionaryId, String code);
    List<DictionaryAttributeDefinition> findByDictionaryIdOrderByNameAscCodeAsc(Long dictionaryId);
    List<DictionaryAttributeDefinition> findByDictionaryIdAndStatusOrderByNameAscCodeAsc(
            Long dictionaryId, DictionaryStatus status);
    Optional<DictionaryAttributeDefinition> findByIdAndDictionaryId(Long id, Long dictionaryId);
    Optional<DictionaryAttributeDefinition> findByDictionaryIdAndCode(Long dictionaryId, String code);
}
