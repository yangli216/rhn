package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.DispenseTaskLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;

public interface DispenseTaskLineRepository extends JpaRepository<DispenseTaskLine, Long> {
    @Query("select distinct line.taskId from DispenseTaskLine line where line.tenantId = :tenantId and line.requestId = :requestId order by line.taskId")
    List<Long> findTaskIdsForRequest(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    boolean existsByTenantIdAndRequestId(Long tenantId, Long requestId);
    List<DispenseTaskLine> findByTenantIdAndTaskIdInOrderByTaskIdAscIdAsc(
            Long tenantId, Collection<Long> taskIds);
    Optional<DispenseTaskLine> findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
            Long tenantId, String fulfillmentSourceType, Long fulfillmentSourceId);
    List<DispenseTaskLine> findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceIdIn(
            Long tenantId, String fulfillmentSourceType, Collection<Long> fulfillmentSourceIds);
    Optional<DispenseTaskLine> findByTenantIdAndTaskId(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
    List<DispenseTaskLine> findByTenantIdAndTaskIdOrderById(Long tenantId, Long taskId);
    List<DispenseTaskLine> findByTenantIdAndTaskIdIn(Long tenantId, Collection<Long> taskIds);
    List<DispenseTaskLine> findByTenantIdAndRequestIdIn(Long tenantId, Collection<Long> requestIds);
    List<DispenseTaskLine> findByTenantIdAndRequestIdOrderById(Long tenantId, Long requestId);
    /** 站点内仍有净发出量（已发>已退）的行，按任务创建时间倒序；停嘱应退候选的必要条件。 */
    @Query("select l from DispenseTaskLine l, DispenseTask t where t.id = l.taskId and t.tenantId = :tenantId "
            + "and l.tenantId = :tenantId and t.stockSiteId = :stockSiteId and l.dispensedQuantity > l.returnedQuantity "
            + "order by t.createdAt desc, t.id desc")
    List<DispenseTaskLine> findNetDispensedBySite(@Param("tenantId") Long tenantId, @Param("stockSiteId") Long stockSiteId);
}
