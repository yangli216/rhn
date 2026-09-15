package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.DiseaseManagementRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DiseaseManagementRuleRepository extends JpaRepository<DiseaseManagementRule, Long> {
    List<DiseaseManagementRule> findByProgramIdOrderByCreatedAt(Long programId);
    List<DiseaseManagementRule> findByProgramIdIn(Collection<Long> programIds);
    void deleteByProgramId(Long programId);
}

