package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientShiftHandoffItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InpatientShiftHandoffItemRepository extends JpaRepository<InpatientShiftHandoffItem, Long> {
    List<InpatientShiftHandoffItem> findByTenantIdAndHandoffIdOrderBySortOrderAscIdAsc(
            Long tenantId, Long handoffId);
}

