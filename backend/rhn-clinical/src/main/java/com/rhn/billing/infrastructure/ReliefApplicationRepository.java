package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ReliefApplication;
import com.rhn.billing.domain.ReliefSponsor;
import com.rhn.billing.domain.ReliefTiming;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ReliefApplicationRepository extends JpaRepository<ReliefApplication, Long> {
    Optional<ReliefApplication> findByTenantIdAndCommandCode(Long tenantId, String commandCode);
    List<ReliefApplication> findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(Long tenantId, Long settlementId);
    List<ReliefApplication> findByTenantIdAndReversesApplicationId(Long tenantId, Long reversesApplicationId);

    /** 机构在时间段内的减免与冲销记录，按发生时间倒序；政策、承担主体与时机为空时不限。 */
    @Query("""
            select a from ReliefApplication a
            where a.tenantId = :tenantId and a.organizationId = :organizationId
              and a.createdAt >= :start and a.createdAt < :end
              and (:policyId is null or a.policyId = :policyId)
              and (:sponsor is null or a.sponsor = :sponsor)
              and (:timing is null or a.timing = :timing)
            order by a.createdAt desc, a.id desc
            """)
    List<ReliefApplication> searchRecords(@Param("tenantId") Long tenantId, @Param("organizationId") Long organizationId,
                                          @Param("start") Instant start, @Param("end") Instant end,
                                          @Param("policyId") Long policyId, @Param("sponsor") ReliefSponsor sponsor,
                                          @Param("timing") ReliefTiming timing, Pageable limit);
}
