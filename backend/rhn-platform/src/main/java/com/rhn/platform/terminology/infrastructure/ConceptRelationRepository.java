package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.ConceptRelation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ConceptRelationRepository extends JpaRepository<ConceptRelation, Long> {
    List<ConceptRelation> findByRelationTypeAndConceptIdIn(String relationType, Collection<Long> conceptIds);
    List<ConceptRelation> findByRelationTypeAndConceptId(String relationType, Long conceptId);
    Optional<ConceptRelation> findByConceptIdAndTargetConceptIdAndRelationType(Long conceptId, Long targetConceptId,
                                                                              String relationType);
}
