package com.rhn.pharmacy.infrastructure;

import com.rhn.pharmacy.domain.InventoryTraceCode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface InventoryTraceCodeRepository extends JpaRepository<InventoryTraceCode, Long> {
    Optional<InventoryTraceCode> findByTenantIdAndNormalizedCode(Long tenantId, String normalizedCode);
    List<InventoryTraceCode> findByTenantIdAndNormalizedCodeIn(Long tenantId, List<String> normalizedCodes);
    List<InventoryTraceCode> findByTenantIdAndGoodsReceiptLineIdOrderById(Long tenantId, Long goodsReceiptLineId);
    List<InventoryTraceCode> findByTenantIdAndCurrentDocumentTypeAndCurrentDocumentIdOrderById(
            Long tenantId, String currentDocumentType, Long currentDocumentId);

    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and (:status is null or t.status=:status) and (:query is null or lower(t.traceCode) like lower(concat('%',:query,'%')) " +
            "or lower(t.productCodeSnapshot) like lower(concat('%',:query,'%')) or lower(t.productNameSnapshot) like lower(concat('%',:query,'%')) " +
            "or lower(t.lotNoSnapshot) like lower(concat('%',:query,'%'))) " +
            "order by t.updatedAt desc")
    List<InventoryTraceCode> search(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                    @Param("status") String status, @Param("query") String query);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and t.stockItemId=:itemId and t.stockLotId=:lotId and t.status='AVAILABLE' order by t.receivedAt, t.id")
    List<InventoryTraceCode> lockAvailable(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                           @Param("itemId") Long itemId, @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.stockSiteId=:siteId " +
            "and t.stockBinId=:binId and t.stockItemId=:itemId and t.stockLotId=:lotId " +
            "and t.status='AVAILABLE' order by t.receivedAt, t.id")
    List<InventoryTraceCode> lockAvailableAtBin(@Param("tenantId") Long tenantId, @Param("siteId") Long siteId,
                                                @Param("binId") Long binId, @Param("itemId") Long itemId,
                                                @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.id=:id")
    Optional<InventoryTraceCode> lockByTenantIdAndId(@Param("tenantId") Long tenantId, @Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.currentDocumentType='STOCK_TRANSFER' " +
            "and t.currentDocumentId=:documentId and t.stockLotId=:lotId and t.status='IN_TRANSIT' order by t.id")
    List<InventoryTraceCode> lockTransferCodes(@Param("tenantId") Long tenantId,
                                               @Param("documentId") Long documentId,
                                               @Param("lotId") Long lotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from InventoryTraceCode t where t.tenantId=:tenantId and t.currentDocumentType='MEDICATION_DISPENSE' " +
            "and t.currentDocumentId=:documentId and t.stockItemId=:itemId and t.stockLotId=:lotId " +
            "and t.status='ISSUED' order by t.id")
    List<InventoryTraceCode> lockIssuedDispenseCodes(@Param("tenantId") Long tenantId,
                                                     @Param("documentId") Long documentId,
                                                     @Param("itemId") Long itemId,
                                                     @Param("lotId") Long lotId);
}
