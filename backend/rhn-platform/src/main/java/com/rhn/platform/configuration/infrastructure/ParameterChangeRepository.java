package com.rhn.platform.configuration.infrastructure;

import com.rhn.platform.configuration.domain.ParameterChange;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ParameterChangeRepository extends JpaRepository<ParameterChange, Long> {
    Optional<ParameterChange> findByRequestCode(String requestCode);

    @Query("""
            select change from ParameterChange change
             where change.definitionId = :definitionId
               and (change.tenantId is null or change.tenantId = :tenantId)
             order by change.changedAt desc
            """)
    List<ParameterChange> findVisible(@Param("definitionId") Long definitionId,
                                      @Param("tenantId") Long tenantId);
}
