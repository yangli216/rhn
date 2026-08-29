package com.rhn.platform.dictionary.infrastructure;

import com.rhn.platform.dictionary.domain.DictionaryChange;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DictionaryChangeRepository extends JpaRepository<DictionaryChange, Long> {
    Optional<DictionaryChange> findFirstByRequestCodeOrderByChangedAtAsc(String requestCode);
    List<DictionaryChange> findByDictionaryIdOrderByChangedAtDesc(Long dictionaryId);
    List<DictionaryChange> findByCategoryIdAndTargetTypeOrderByChangedAtDesc(
            Long categoryId, com.rhn.platform.dictionary.domain.DictionaryChangeTargetType targetType);
}
