package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.ConceptAlias;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ConceptAliasRepository extends JpaRepository<ConceptAlias, Long> {
    List<ConceptAlias> findByConceptIdIn(Collection<Long> conceptIds);
    List<ConceptAlias> findByConceptIdOrderByAliasName(Long conceptId);
}
