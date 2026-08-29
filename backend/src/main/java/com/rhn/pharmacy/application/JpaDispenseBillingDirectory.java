package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
@Transactional(readOnly = true)
public class JpaDispenseBillingDirectory implements DispenseBillingDirectory {
    private final MedicationDispenseRepository dispenseRepository;
    private final DispenseTaskLineRepository taskLineRepository;
    private final StockItemRepository stockItemRepository;
    private final StockSiteRepository stockSiteRepository;

    public JpaDispenseBillingDirectory(
            MedicationDispenseRepository dispenseRepository,
            DispenseTaskLineRepository taskLineRepository,
            StockItemRepository stockItemRepository,
            StockSiteRepository stockSiteRepository) {
        this.dispenseRepository = dispenseRepository;
        this.taskLineRepository = taskLineRepository;
        this.stockItemRepository = stockItemRepository;
        this.stockSiteRepository = stockSiteRepository;
    }

    @Override
    public List<DispenseBillingFact> findByEncounter(Long tenantId, Long encounterId) {
        return facts(tenantId, dispenseRepository
                .findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(tenantId, encounterId));
    }

    @Override
    public List<DispenseBillingFact> findWorklist(Long tenantId, Long organizationId) {
        return facts(tenantId, dispenseRepository.findWorklist(tenantId, organizationId));
    }

    @Override
    public List<DispenseBillingFact> findOccurredBetween(
            Long tenantId, Long organizationId, Instant from, Instant to) {
        return facts(tenantId, dispenseRepository.findDaily(tenantId, organizationId, from, to));
    }

    private List<DispenseBillingFact> facts(Long tenantId, List<MedicationDispense> values) {
        return values.stream().map(value -> fact(tenantId, value)).toList();
    }

    private DispenseBillingFact fact(Long tenantId, MedicationDispense value) {
        DispenseTaskLine line = taskLineRepository.findByTenantIdAndTaskId(tenantId, value.taskId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "未找到发药任务行"));
        StockItem item = stockItemRepository.findByIdAndTenantId(line.stockItemId(), tenantId)
                .orElseThrow(() -> notFound("DISPENSE_STOCK_ITEM_NOT_FOUND", "未找到发药经营项目"));
        StockSite site = stockSiteRepository.findByIdAndTenantId(value.stockSiteId(), tenantId)
                .orElseThrow(() -> notFound("DISPENSE_STOCK_SITE_NOT_FOUND", "未找到发药药房"));
        return new DispenseBillingFact(value.id(), value.residentId(), value.encounterId(), value.stockSiteId(),
                site.organizationId(), value.originalDispenseId(), value.dispenseNo(), value.dispenseType(),
                value.occurredAt(), value.operationQuantity(), value.operationUnitCode(), line.requestId(),
                item.catalogItemId(), line.packageId(), line.baseQuantityFactor(),
                line.productCodeSnapshot(), line.productNameSnapshot());
    }
}
