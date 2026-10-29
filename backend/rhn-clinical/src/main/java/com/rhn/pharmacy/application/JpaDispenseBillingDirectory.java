package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.DispenseBillingDirectory;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
@Transactional(readOnly = true)
public class JpaDispenseBillingDirectory implements DispenseBillingDirectory {
    private final MedicationDispenseRepository dispenseRepository;
    private final MedicationDispenseLineRepository dispenseLines;
    private final DispenseTaskLineRepository taskLineRepository;
    private final StockItemRepository stockItemRepository;
    private final StockSiteRepository stockSiteRepository;

    public JpaDispenseBillingDirectory(
            MedicationDispenseRepository dispenseRepository,
            DispenseTaskLineRepository taskLineRepository,
            StockItemRepository stockItemRepository,
            StockSiteRepository stockSiteRepository, MedicationDispenseLineRepository dispenseLines) {
        this.dispenseRepository = dispenseRepository;
        this.dispenseLines = dispenseLines;
        this.taskLineRepository = taskLineRepository;
        this.stockItemRepository = stockItemRepository;
        this.stockSiteRepository = stockSiteRepository;
    }

    @Override
    public DispenseBillingFact requireById(Long tenantId, Long dispenseId) {
        MedicationDispense value = dispenseRepository.findByIdAndTenantId(dispenseId, tenantId)
                .orElseThrow(() -> notFound("MEDICATION_DISPENSE_NOT_FOUND", "未找到发退药事实"));
        DispenseTaskLine line = taskLineRepository.findByTenantIdAndTaskId(tenantId, value.taskId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "未找到发药任务行"));
        StockItem item = stockItemRepository.findByIdAndTenantId(line.stockItemId(), tenantId)
                .orElseThrow(() -> notFound("DISPENSE_STOCK_ITEM_NOT_FOUND", "未找到发药经营项目"));
        StockSite site = stockSiteRepository.findByIdAndTenantId(value.stockSiteId(), tenantId)
                .orElseThrow(() -> notFound("DISPENSE_STOCK_SITE_NOT_FOUND", "未找到发药药房"));
        return fact(value, line, item, site,
                dispenseLines.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(tenantId, value.id()));
    }

    @Override
    public List<DispenseBillingFact> findByEncounter(Long tenantId, Long encounterId) {
        return facts(tenantId, dispenseRepository
                .findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(tenantId, encounterId));
    }

    @Override
    public List<DispenseBillingFact> findByEncounters(Long tenantId, Long organizationId,
                                                      Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return List.of();
        return facts(tenantId, dispenseRepository.findByEncounterIds(tenantId, organizationId, encounterIds));
    }

    @Override
    public List<DispenseBillingFact> findOccurredBetween(
            Long tenantId, Long organizationId, Instant from, Instant to) {
        return facts(tenantId, dispenseRepository.findDaily(tenantId, organizationId, from, to));
    }

    /**
     * 批量装配发退药事实：任务行、经营项目、药房与实际明细各一次批量查询，
     * 避免按发退药条数逐条回查。
     */
    private List<DispenseBillingFact> facts(Long tenantId, List<MedicationDispense> values) {
        List<MedicationDispense> billable = values.stream().filter(value -> billable(value.dispenseType())).toList();
        if (billable.isEmpty()) return List.of();
        Set<Long> taskIds = new LinkedHashSet<>();
        for (MedicationDispense value : billable) {
            if (value.taskId() != null) taskIds.add(value.taskId());
        }
        if (taskIds.isEmpty()) throw notFound("DISPENSE_TASK_LINE_NOT_FOUND", "未找到发药任务行");
        Map<Long, DispenseTaskLine> lineByTask = new LinkedHashMap<>();
        for (DispenseTaskLine line : taskLineRepository.findByTenantIdAndTaskIdIn(tenantId, taskIds)) {
            lineByTask.putIfAbsent(line.taskId(), line);
        }
        Set<Long> stockItemIds = new LinkedHashSet<>();
        for (DispenseTaskLine line : lineByTask.values()) {
            if (line.stockItemId() != null) stockItemIds.add(line.stockItemId());
        }
        Map<Long, StockItem> itemById = new LinkedHashMap<>();
        for (StockItem item : stockItemRepository.findByTenantIdAndIdIn(tenantId, stockItemIds)) {
            itemById.put(item.id(), item);
        }
        Set<Long> siteIds = new LinkedHashSet<>();
        for (MedicationDispense value : billable) {
            if (value.stockSiteId() != null) siteIds.add(value.stockSiteId());
        }
        Map<Long, StockSite> siteById = new LinkedHashMap<>();
        for (StockSite site : stockSiteRepository.findByTenantIdAndIdIn(tenantId, siteIds)) {
            siteById.put(site.id(), site);
        }
        Set<Long> dispenseIds = new LinkedHashSet<>();
        for (MedicationDispense value : billable) dispenseIds.add(value.id());
        Map<Long, List<MedicationDispenseLine>> linesByDispense = new LinkedHashMap<>();
        for (MedicationDispenseLine line : dispenseLines
                .findByTenantIdAndMedicationDispenseIdInOrderBySortOrder(tenantId, dispenseIds)) {
            linesByDispense.computeIfAbsent(line.medicationDispenseId(), ignored -> new java.util.ArrayList<>())
                    .add(line);
        }
        List<DispenseBillingFact> result = new java.util.ArrayList<>(billable.size());
        for (MedicationDispense value : billable) {
            DispenseTaskLine line = lineByTask.get(value.taskId());
            if (line == null) throw notFound("DISPENSE_TASK_LINE_NOT_FOUND", "未找到发药任务行");
            StockItem item = itemById.get(line.stockItemId());
            if (item == null) throw notFound("DISPENSE_STOCK_ITEM_NOT_FOUND", "未找到发药经营项目");
            StockSite site = siteById.get(value.stockSiteId());
            if (site == null) throw notFound("DISPENSE_STOCK_SITE_NOT_FOUND", "未找到发药药房");
            result.add(fact(value, line, item, site, linesByDispense.getOrDefault(value.id(), List.of())));
        }
        return result;
    }

    /** Cancellation events only reverse stock; they carry no actual lines and must not become charge facts. */
    private static boolean billable(String dispenseType) {
        return "DISPENSE".equals(dispenseType) || "REDISPENSE".equals(dispenseType) || "RETURN".equals(dispenseType);
    }

    private DispenseBillingFact fact(MedicationDispense value, DispenseTaskLine line, StockItem item,
                                     StockSite site, List<MedicationDispenseLine> actualLines) {
        if (!Objects.equals(site.organizationId(), value.organizationId())) {
            throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "当前药房所属机构与原发退药机构不一致");
        }
        if (actualLines.isEmpty()) throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "发退药缺少实际明细，不能确认数量换算");
        BigDecimal factor = actualLines.getFirst().baseQuantityFactor();
        BigDecimal total = BigDecimal.ZERO;
        for (MedicationDispenseLine actual : actualLines) {
            if (!Objects.equals(actual.taskLineId(), line.id()) || !Objects.equals(actual.stockItemId(), item.id())
                    || !Objects.equals(actual.tenantId(), value.tenantId())
                    || !Objects.equals(actual.medicationDispenseId(), value.id())
                    || !Objects.equals(actual.dispenseUnitCode(), value.operationUnitCode())
                    || actual.quantityDispensed() == null || actual.quantityDispensed().signum() <= 0
                    || factor == null || factor.signum() <= 0 || actual.baseQuantityFactor() == null
                    || factor.compareTo(actual.baseQuantityFactor()) != 0) {
                throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "发退药明细的产品、单位、数量或换算系数不一致");
            }
            total = total.add(actual.quantityDispensed());
        }
        if (value.operationQuantity() == null || total.compareTo(value.operationQuantity()) != 0) {
            throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "发退药汇总数量与实际明细不一致");
        }
        return new DispenseBillingFact(value.id(), value.residentId(), value.encounterId(), value.stockSiteId(),
                value.organizationId(), value.originalDispenseId(), value.dispenseNo(), value.dispenseType(),
                value.occurredAt(), value.operationQuantity(), value.operationUnitCode(), line.requestId(),
                item.catalogItemId(), line.packageId(), factor,
                line.productCodeSnapshot(), line.productNameSnapshot(), value.taskId(), value.dispenserUserId());
    }
}
