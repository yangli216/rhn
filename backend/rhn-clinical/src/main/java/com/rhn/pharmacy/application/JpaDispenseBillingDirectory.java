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
import java.math.BigDecimal;
import java.util.Objects;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import static com.rhn.shared.api.BusinessErrors.conflict;
import java.util.List;

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
        return fact(tenantId, value);
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
        if (!Objects.equals(site.organizationId(), value.organizationId())) {
            throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "当前药房所属机构与原发退药机构不一致");
        }
        var actualLines = dispenseLines.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(tenantId, value.id());
        if (actualLines.isEmpty()) throw conflict("DISPENSE_BILLING_FACT_UNVERIFIED", "发退药缺少实际明细，不能确认数量换算");
        BigDecimal factor = actualLines.getFirst().baseQuantityFactor();
        BigDecimal total = BigDecimal.ZERO;
        for (var actual : actualLines) {
            if (!Objects.equals(actual.taskLineId(), line.id()) || !Objects.equals(actual.stockItemId(), item.id())
                    || !Objects.equals(actual.tenantId(), tenantId) || !Objects.equals(actual.medicationDispenseId(), value.id())
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
