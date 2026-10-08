package com.rhn.billing.application;

import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingView;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceQuickContextTruthTest {
    final InsuranceClaimRepository claims = mock(InsuranceClaimRepository.class);
    final SettlementRepository settlements = mock(SettlementRepository.class);
    final SettlementLineRepository lines = mock(SettlementLineRepository.class);
    final ChargeItemRepository charges = mock(ChargeItemRepository.class);
    final PatientAccountRepository accounts = mock(PatientAccountRepository.class);
    final CoverageDirectory coverages = mock(CoverageDirectory.class);
    final InsuranceQuickSubmissionResolver resolver = mock(InsuranceQuickSubmissionResolver.class);
    final ItemStandardMappingDirectory mappings = mock(ItemStandardMappingDirectory.class);
    final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    final PatientAccount account = mock(PatientAccount.class);
    final ChargeItem charge = mock(ChargeItem.class);
    final LocalDate date = LocalDate.of(2026,10,4);
    InsuranceClaimTransactionService service;

    @BeforeEach void setup() {
        service = new InsuranceClaimTransactionService(claims, mock(InsuranceClaimLineRepository.class),
                mock(InsuranceClaimResponseRepository.class), settlements, lines, charges, accounts, coverages,
                mock(SettlementApplicationService.class), contexts, mock(JsonCodec.class), resolver, mappings, mock(com.rhn.platform.integration.api.ExternalMessageService.class));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,10L,"cashier","corr",Set.of(),2L,3L,"SELF",Set.of(),Set.of()));
        var settlement=mock(Settlement.class); when(settlement.patientAccountId()).thenReturn(4L);
        when(settlements.findByIdAndTenantId(5L,1L)).thenReturn(Optional.of(settlement));
        when(account.id()).thenReturn(4L); when(account.organizationId()).thenReturn(2L);
        when(account.residentId()).thenReturn(6L); when(account.encounterId()).thenReturn(7L);
        when(accounts.findByIdAndTenantId(4L,1L)).thenReturn(Optional.of(account));
        var visit=new InsuranceQuickSubmissionResolver.Visit("doctor",Instant.parse("2026-10-04T01:00:00Z"),null,date);
        when(resolver.visit(account)).thenReturn(visit);
        when(coverages.requireExistingActive(null,6L,date,null)).thenReturn(new CoverageDirectory.CoverageView(8L,6L,"310","真实保障",true,date,null));
        when(resolver.resolve(account,visit,"310",null)).thenReturn(new InsuranceQuickSubmissionResolver.Submission("330100","H","D","P","REAL-INSURANCE","SHA256-actual"));
        var line=mock(SettlementLine.class); when(line.id()).thenReturn(9L); when(line.chargeItemId()).thenReturn(11L);
        when(lines.findByTenantIdAndSettlementIdOrderByLineNoAsc(1L,5L)).thenReturn(List.of(line));
        when(charge.id()).thenReturn(11L); when(charge.tenantId()).thenReturn(1L);
        when(charge.patientAccountId()).thenReturn(4L); when(charge.encounterId()).thenReturn(7L);
        when(charge.catalogItemId()).thenReturn(12L); when(charge.itemCodeSnapshot()).thenReturn("LOCAL-ITEM");
        when(charges.findAllById(List.of(11L))).thenReturn(List.of(charge));
        var maintained = mapping("EXACT","REAL-INSURANCE");
        when(mappings.resolve(1L,"CATALOG_ITEM",12L,"INSURANCE",date)).thenReturn(List.of(maintained));
    }
    ItemTermMappingView mapping(String equivalence,String system) {
        var value=mock(ItemTermMappingView.class); when(value.id()).thenReturn(13L);
        when(value.systemCode()).thenReturn(system); when(value.mappingType()).thenReturn("INSURANCE");
        when(value.authorityType()).thenReturn("INSURANCE"); when(value.status()).thenReturn("ACTIVE");
        when(value.equivalence()).thenReturn(equivalence); when(value.termCode()).thenReturn("REGISTERED-ITEM"); return value;
    }
    InsuranceClaimTransactionService.QuickContext resolve() { return service.quickPreSettleContext(5L,null,null,null); }
    @Test void usesExistingCoverageAndExactMaintainedMapping() {
        var result=resolve(); assertEquals(8L,result.coverage().id());
        assertEquals("REGISTERED-ITEM",result.lines().getFirst().insuranceItemCode());
        assertEquals("13",result.lines().getFirst().traceAttributes().get("mappingId"));
        verifyNoInteractions(claims);
    }
    @Test void missingCoverageCannotContinueToMappingOrCreateAClaim() {
        when(coverages.requireExistingActive(null,6L,date,null)).thenThrow(com.rhn.shared.api.BusinessErrors.conflict("COVERAGE_REQUIRED","missing"));
        assertThrows(BusinessException.class,this::resolve); verifyNoInteractions(mappings,claims);
    }
    @Test void missingMappingDoesNotPrefixTheLocalCatalogCode() {
        when(mappings.resolve(1L,"CATALOG_ITEM",12L,"INSURANCE",date)).thenReturn(List.of());
        assertEquals("INSURANCE_ITEM_MAPPING_UNCONFIRMED",assertThrows(BusinessException.class,this::resolve).code());
        verifyNoInteractions(claims);
    }
    @Test void ambiguousWrongSystemAndInexactMappingsAreNotSilentlySelected() {
        for(var values:List.of(List.of(mapping("EXACT","OTHER")),List.of(mapping("RELATED","REAL-INSURANCE")),
                List.of(mapping("EXACT","REAL-INSURANCE"),mapping("EQUIVALENT","REAL-INSURANCE")))) {
            when(mappings.resolve(1L,"CATALOG_ITEM",12L,"INSURANCE",date)).thenReturn(values);
            assertThrows(BusinessException.class,this::resolve);
        }
    }
    @Test void otherOrganizationAndWrongChargeOwnershipAreRejectedBeforeSubmission() {
        when(account.organizationId()).thenReturn(99L);
        assertEquals("INSURANCE_CLAIM_FORBIDDEN",assertThrows(BusinessException.class,this::resolve).code());
        verifyNoInteractions(resolver,mappings);
        when(account.organizationId()).thenReturn(2L); when(charge.tenantId()).thenReturn(99L);
        assertEquals("INSURANCE_CHARGE_CONTEXT_INVALID",assertThrows(BusinessException.class,this::resolve).code());
    }
}
