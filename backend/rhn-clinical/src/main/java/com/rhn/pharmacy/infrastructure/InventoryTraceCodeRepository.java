package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTraceCode;
import com.rhn.pharmacy.domain.InventoryTraceCodeStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface InventoryTraceCodeRepository extends JpaRepository<InventoryTraceCode, Long> {
    Optional<InventoryTraceCode> findByTenantIdAndNormalizedCode(Long tenantId, String normalizedCode);
    List<InventoryTraceCode> findByTenantIdAndNormalizedCodeIn(Long tenantId, List<String> normalizedCodes);
    List<InventoryTraceCode> findByTenantIdAndGoodsReceiptLineIdOrderById(Long tenantId, Long goodsReceiptLineId);
    List<InventoryTraceCode> findByTenantIdAndGoodsReceiptLineIdInOrderByGoodsReceiptLineIdAscIdAsc(
            Long tenantId, Collection<Long> goodsReceiptLineIds);
    List<InventoryTraceCode> findByTenantIdAndCurrentDocumentTypeAndCurrentDocumentIdOrderById(
            Long tenantId, String currentDocumentType, Long currentDocumentId);

    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and (:status is null or t.status=:status) and (:query is null or lower(t.traceCode) like lower(concat('%',:query,'%')) " +
            "or lower(t.productCodeSnapshot) like lower(concat('%',:query,'%')) or lower(t.productNameSnapshot) like lower(concat('%',:query,'%')) " +
            "or lower(t.lotNoSnapshot) like lower(concat('%',:query,'%'))) " +
            "order by t.updatedAt desc")
    List<InventoryTraceCode> search(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                    @Param("status") InventoryTraceCodeStatus status, @Param("query") String query);

    /** 台账分页：筛选与排序下推到数据库，前端不再全量拉取后再切片。 */
    @Query(value = "select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and (:status is null or t.status=:status) and (:query is null or lower(t.traceCode) like lower(concat('%',:query,'%')) " +
            "or lower(t.productCodeSnapshot) like lower(concat('%',:query,'%')) or lower(t.productNameSnapshot) like lower(concat('%',:query,'%')) " +
            "or lower(t.lotNoSnapshot) like lower(concat('%',:query,'%'))) " +
            "order by t.updatedAt desc, t.id desc",
            countQuery = "select count(t) from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and (:status is null or t.status=:status) and (:query is null or lower(t.traceCode) like lower(concat('%',:query,'%')) " +
            "or lower(t.productCodeSnapshot) like lower(concat('%',:query,'%')) or lower(t.productNameSnapshot) like lower(concat('%',:query,'%')) " +
            "or lower(t.lotNoSnapshot) like lower(concat('%',:query,'%'))) ")
    Page<InventoryTraceCode> searchPage(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                        @Param("status") InventoryTraceCodeStatus status,
                                        @Param("query") String query, Pageable pageable);

    /** 台账顶部指标按站点一次聚合，避免前端为计数再拉一遍全量台账。 */
    @Query("""
            select count(t) as total,
                   sum(case when t.status in :availableStatuses then 1 else 0 end) as available,
                   sum(case when t.status = :transitStatus then 1 else 0 end) as transit,
                   sum(case when t.status in :exceptionStatuses then 1 else 0 end) as exceptions
            from InventoryTraceCode t
            where t.tenantId = :tenantId and t.stockSiteId = :siteId
            """)
    TraceCodeSummary summarize(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                               @Param("availableStatuses") Collection<InventoryTraceCodeStatus> availableStatuses,
                               @Param("transitStatus") InventoryTraceCodeStatus transitStatus,
                               @Param("exceptionStatuses") Collection<InventoryTraceCodeStatus> exceptionStatuses);

    interface TraceCodeSummary {
        Long getTotal();
        Long getAvailable();
        Long getTransit();
        Long getExceptions();
    }

    /** 入库单追溯汇总按明细一次聚合登记数，避免逐明细回查。 */
    @Query("""
            select t.goodsReceiptLineId as lineId, count(t) as total
            from InventoryTraceCode t
            where t.tenantId = :tenantId and t.goodsReceiptLineId in :lineIds
            group by t.goodsReceiptLineId
            """)
    List<TraceCodeLineCount> countByGoodsReceiptLineIds(@Param("tenantId") Long tenantId,
                                                        @Param("lineIds") Collection<Long> lineIds);

    interface TraceCodeLineCount {
        Long getLineId();
        Long getTotal();
    }

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and t.stockItemId=:itemId and t.stockLotId=:lotId " +
            "and t.status=com.rhn.pharmacy.domain.InventoryTraceCodeStatus.AVAILABLE order by t.receivedAt, t.id")
    List<InventoryTraceCode> lockAvailable(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                           @Param("itemId") Long itemId, @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and t.stockBinId=:binId and t.stockItemId=:itemId and t.stockLotId=:lotId " +
            "and t.status=com.rhn.pharmacy.domain.InventoryTraceCodeStatus.AVAILABLE order by t.receivedAt, t.id")
    List<InventoryTraceCode> lockAvailableAtBin(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                                @Param("binId") Long binId, @Param("itemId") Long itemId,
                                                @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.id=:id")
    Optional<InventoryTraceCode> lockByTenantIdAndId(@Param("tenantId") Long tenantId, @Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.currentDocumentType='STOCK_TRANSFER' " +
            "and t.currentDocumentId=:documentId and t.stockLotId=:lotId " +
            "and t.status=com.rhn.pharmacy.domain.InventoryTraceCodeStatus.IN_TRANSIT order by t.id")
    List<InventoryTraceCode> lockTransferCodes(@Param("tenantId") Long tenantId,
                                               @Param("documentId") Long documentId,
                                               @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.currentDocumentType='MEDICATION_DISPENSE' " +
            "and t.currentDocumentId=:documentId and t.stockItemId=:itemId and t.stockLotId=:lotId " +
            "and t.status=com.rhn.pharmacy.domain.InventoryTraceCodeStatus.ISSUED order by t.id")
    List<InventoryTraceCode> lockIssuedDispenseCodes(@Param("tenantId") Long tenantId,
                                                     @Param("documentId") Long documentId,
                                                     @Param("itemId") Long itemId,
                                                     @Param("lotId") Long lotId);
}
