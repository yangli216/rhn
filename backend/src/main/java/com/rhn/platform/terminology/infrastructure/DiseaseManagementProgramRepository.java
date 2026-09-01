package com.rhn.platform.terminology.infrastructure;

import com.rhn.platform.terminology.domain.DiseaseManagementProgram;
import com.rhn.platform.terminology.domain.TerminologyScope;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DiseaseManagementProgramRepository extends JpaRepository<DiseaseManagementProgram, Long> {
    boolean existsByScopeTypeAndScopeIdAndCode(TerminologyScope scopeType, Long scopeId, String code);
    List<DiseaseManagementProgram> findAllByOrderByName();
}
