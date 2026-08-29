package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.PharmacyReview;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PharmacyReviewRepository extends JpaRepository<PharmacyReview, Long> {
    List<PharmacyReview> findByTenantIdAndTaskIdOrderByReviewedAt(Long tenantId, Long taskId);
}
