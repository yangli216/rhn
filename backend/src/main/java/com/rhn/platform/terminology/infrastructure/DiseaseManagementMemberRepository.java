package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.DiseaseManagementMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface DiseaseManagementMemberRepository extends JpaRepository<DiseaseManagementMember, Long> {
    List<DiseaseManagementMember> findByProgramIdOrderByCreatedAt(Long programId);
    List<DiseaseManagementMember> findByProgramIdIn(Collection<Long> programIds);
    List<DiseaseManagementMember> findByConceptIdIn(Collection<Long> conceptIds);
    void deleteByProgramId(Long programId);
}
