package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientNursingRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface InpatientNursingRecordRepository extends JpaRepository<InpatientNursingRecord, Long> {
    Optional<InpatientNursingRecord> findByTenantIdAndCommandCode(Long tenantId, String commandCode);

    List<InpatientNursingRecord>
    findByTenantIdAndOrganizationIdAndDepartmentIdAndEpisodeIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThanOrderByOccurredAtAscIdAsc(
            Long tenantId, Long organizationId, Long departmentId, Long episodeId, Instant from, Instant to);
}

