package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintMediaProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PrintMediaProfileRepository extends JpaRepository<PrintMediaProfile, Long> {
    List<PrintMediaProfile> findByTenantIdIsNullAndStatusOrderByMediaKindAscMediaNameAsc(String status);
    List<PrintMediaProfile> findByTenantIdAndStatusOrderByMediaKindAscMediaNameAsc(Long tenantId, String status);
}
