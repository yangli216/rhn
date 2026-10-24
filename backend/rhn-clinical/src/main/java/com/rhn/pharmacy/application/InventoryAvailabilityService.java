package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.infrastructure.InventoryBalanceRepository;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * The only application-level gateway allowed to access the mutable inventory balance projection.
 * Business workflows must use this gateway so locking and persistence cannot be bypassed accidentally.
 */
@Service
public class InventoryAvailabilityService {
    private final InventoryBalanceRepository repository;

    public InventoryAvailabilityService(InventoryBalanceRepository repository) {
        this.repository = repository;
    }

    public Optional<InventoryBalance> lockDimension(Long tenantId, Long binId, Long itemId,
                                                    Long lotId, String stockStatus) {
        return repository.lockDimension(tenantId, binId, itemId, lotId, stockStatus);
    }

    public Optional<InventoryBalance> lockById(Long id, Long tenantId) {
        return repository.lockByIdAndTenantId(id, tenantId);
    }

    public Optional<InventoryBalance> lockByIdAndTenantId(Long id, Long tenantId) {
        return lockById(id, tenantId);
    }

    public List<InventoryBalance> lockSiteBalances(Long tenantId, Long siteId) {
        return repository.lockSiteBalances(tenantId, siteId);
    }

    public List<InventoryBalance> lockIssuable(Long tenantId, Long siteId, Long itemId,
                                               LocalDate businessDate, String issuePolicy) {
        return "FIFO".equals(issuePolicy)
                ? repository.lockIssuableFifo(tenantId, siteId, itemId, businessDate)
                : repository.lockIssuableFefo(tenantId, siteId, itemId, businessDate);
    }

    public List<InventoryBalance> findBySite(Long tenantId, Long siteId) {
        return repository.findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
                tenantId, siteId);
    }

    /** 按库存项汇总可用数量，供目录检索使用；口径与明细过滤一致（AVAILABLE 且数量>0）。 */
    public Map<Long, BigDecimal> availableQuantitiesByStockItem(Long tenantId, Long siteId) {
        return repository.availableQuantitiesByStockItem(tenantId, siteId).stream()
                .collect(Collectors.toMap(InventoryBalanceRepository.ItemAvailability::getStockItemId,
                        InventoryBalanceRepository.ItemAvailability::getQuantity));
    }

    /** 仓库库存页按库存项聚合：一次 SQL 汇总全部批次×库位明细，替代整表明细回传后的前端汇总。 */
    public List<InventoryBalanceRepository.StockItemBalanceSummary> summarizeByStockItem(
            Long tenantId, Long siteId, LocalDate today, LocalDate expiryLimit) {
        return repository.summarizeByStockItem(tenantId, siteId, today, expiryLimit);
    }

    /** 每个库存项涉及的批号（去重），供库存页按批号搜索保持原有筛选能力。 */
    public Map<Long, List<String>> lotNosByStockItem(Long tenantId, Long siteId) {
        return repository.distinctLotNosByStockItem(tenantId, siteId).stream()
                .collect(Collectors.groupingBy(InventoryBalanceRepository.StockItemLotNo::getStockItemId,
                        Collectors.mapping(InventoryBalanceRepository.StockItemLotNo::getLotNo,
                                Collectors.toList())));
    }

    public List<InventoryBalance> findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
            Long tenantId, Long siteId) {
        return findBySite(tenantId, siteId);
    }

    public List<InventoryBalance> findByBin(Long tenantId, Long binId) {
        return repository.findByTenantIdAndStockBinIdOrderByStockItemIdAscStockLotIdAsc(tenantId, binId);
    }

    public List<InventoryBalance> findByTenantIdAndStockBinIdOrderByStockItemIdAscStockLotIdAsc(
            Long tenantId, Long binId) {
        return findByBin(tenantId, binId);
    }

    public List<InventoryBalance> findByItem(Long tenantId, Long siteId, Long itemId) {
        return repository.findByTenantIdAndStockSiteIdAndStockItemIdOrderByProjectedAtDesc(
                tenantId, siteId, itemId);
    }

    public Page<InventoryBalance> findBySite(Long tenantId, Long siteId, Pageable pageable) {
        return repository.findByTenantIdAndStockSiteIdOrderByStockBinIdAscStockItemIdAscStockLotIdAsc(
                tenantId, siteId, pageable);
    }

    public Page<InventoryBalance> findByItem(Long tenantId, Long siteId, Long itemId, Pageable pageable) {
        return repository.findByTenantIdAndStockSiteIdAndStockItemIdOrderByProjectedAtDesc(
                tenantId, siteId, itemId, pageable);
    }

    public InventoryBalance save(InventoryBalance balance) {
        return repository.save(balance);
    }

    public void flush() {
        repository.flush();
    }
}
