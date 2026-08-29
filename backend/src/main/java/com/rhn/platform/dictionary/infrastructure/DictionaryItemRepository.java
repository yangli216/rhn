package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DictionaryItemRepository extends JpaRepository<DictionaryItem, Long> {
    boolean existsByDictionaryIdAndCode(Long dictionaryId, String code);
    long countByDictionaryId(Long dictionaryId);
    List<DictionaryItem> findByDictionaryIdOrderBySortOrderAscCodeAsc(Long dictionaryId);
    Optional<DictionaryItem> findByIdAndDictionaryId(Long id, Long dictionaryId);
    Optional<DictionaryItem> findByDictionaryIdAndCode(Long dictionaryId, String code);
}
