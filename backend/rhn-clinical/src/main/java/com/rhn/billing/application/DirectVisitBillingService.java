package com.rhn.billing.application;

import com.rhn.outpatient.api.DirectVisitBillingDirectory;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
@Transactional
public class DirectVisitBillingService implements DirectVisitBillingDirectory {
    private final RegistrationBillingIntentRepository intents;
    private final PatientAccountRepository accounts;
    private final ChargeItemRepository charges;
    private final ChargeItemComponentRepository components;
    private final LedgerEntryRepository ledger;
    private final CatalogLifecycleDirectory catalog;
    private final ServiceCatalogDirectory services;
    private final ExecutionContextProvider contexts;

    public DirectVisitBillingService(RegistrationBillingIntentRepository intents, PatientAccountRepository accounts,
            ChargeItemRepository charges, ChargeItemComponentRepository components, LedgerEntryRepository ledger,
            CatalogLifecycleDirectory catalog, ServiceCatalogDirectory services, ExecutionContextProvider contexts) {
        this.intents = intents; this.accounts = accounts; this.charges = charges; this.components = components;
        this.ledger = ledger; this.catalog = catalog; this.services = services; this.contexts = contexts;
    }

    @Override
    public void requireNoPendingRegistration(Long residentId, Long organizationId, Long departmentId) {
        if (intents.existsByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                contexts.requireCurrent().tenantId(), residentId, organizationId, departmentId,
                List.of("PAYMENT_PENDING", "PAID", "COMPLETING", "COMPLETION_FAILED"))) {
            throw conflict("DIRECT_VISIT_REGISTRATION_PENDING", "患者已有待完成的挂号收费业务，请先完成或取消原挂号，不能重复自动挂号");
        }
    }

    @Override
    public void requireRegistrationPaid(Long encounterId) {
        intents.findByTenantIdAndEncounterId(contexts.requireCurrent().tenantId(), encounterId).ifPresent(intent -> {
            if (!"COMPLETED".equals(intent.status())) {
                throw conflict("DIRECT_VISIT_REGISTRATION_UNPAID", "原挂号尚未完成收费，不能通过直接接诊跳过收费");
            }
        });
    }

    @Override
    public void chargeService(Long residentId, Long encounterId, Long organizationId, Long departmentId, Long catalogItemId) {
        if (catalogItemId == null) return;
        var context = contexts.requireCurrent();
        if (charges.findByTenantIdAndSourceTypeAndSourceId(context.tenantId(), "DIRECT_VISIT_SERVICE", encounterId).isPresent()) return;
        LocalDate date = LocalDate.now(ZoneId.of("Asia/Shanghai"));
        services.requireSchedulableOutpatientService(context.tenantId(), organizationId, catalogItemId, date);
        var resolved = catalog.resolve(context.tenantId(), catalogItemId, organizationId, null, "SALE", date);
        if (!resolved.item().chargeable()) return;
        var price = resolved.price();
        if (price == null || price.price().signum() < 0) {
            throw conflict("DIRECT_VISIT_PRICE_MISSING", "直接接诊配置的门诊服务缺少有效价格，请维护价格或清空科室门诊服务参数");
        }
        BigDecimal amount = price.price().setScale(6, RoundingMode.HALF_UP);
        if (amount.signum() == 0) return;
        var account = accounts.findByTenantIdAndEncounterIdAndCurrencyCode(context.tenantId(), encounterId, price.currencyCode())
                .orElseGet(() -> accounts.save(new PatientAccount(context.tenantId(), residentId, encounterId,
                        organizationId, departmentId, price.currencyCode())));
        Instant now = Instant.now();
        var item = resolved.item();
        String accountingCategory = item.accountingCategory() != null && !item.accountingCategory().isBlank()
                ? item.accountingCategory().trim()
                : "REGISTRATION";
        var charge = charges.save(new ChargeItem(context.tenantId(), organizationId, departmentId, account.id(),
                residentId, encounterId, null, catalogItemId, "DIRECT_VISIT_SERVICE", encounterId,
                "DIRECT-VISIT-" + encounterId, BigDecimal.ONE, item.unitCode(), amount, amount,
                price.currencyCode(), price.id(), price.revision(), price.sdPriceType(), item.code(), item.name(),
                now, context.subjectId(), null, accountingCategory));
        components.save(new ChargeItemComponent(context.tenantId(), charge.id(), catalogItemId, item.code(), item.name(),
                BigDecimal.ONE, item.unitCode(), BigDecimal.ONE, amount, amount));
        ledger.save(new LedgerEntry(context.tenantId(), account.id(), "CHARGE", "DEBIT", amount, price.currencyCode(),
                charge.id(), null, null, null, now, context.subjectId()));
    }
}
