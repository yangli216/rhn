package com.rhn.inpatient.application;

import com.rhn.billing.api.InpatientBillingDirectory;
import com.rhn.inpatient.domain.*;
import com.rhn.inpatient.infrastructure.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InpatientBedEstimateTruthTest {
    private final CareEpisodeRepository episodes = mock(CareEpisodeRepository.class);
    private final InpatientEncounterRepository encounters = mock(InpatientEncounterRepository.class);
    private final InpatientCareRequestRepository requests = mock(InpatientCareRequestRepository.class);
    private final InpatientOrderTaskRepository tasks = mock(InpatientOrderTaskRepository.class);
    private final EncounterLocationHistoryRepository locations = mock(EncounterLocationHistoryRepository.class);
    private final InpatientBedProfileRepository beds = mock(InpatientBedProfileRepository.class);
    private final InpatientBedDayFactRepository bedDays = mock(InpatientBedDayFactRepository.class);
    private final ServiceLocationRepository serviceLocations = mock(ServiceLocationRepository.class);
    private final InpatientBillingDirectory billing = mock(InpatientBillingDirectory.class);
    private final CatalogLifecycleDirectory catalog = mock(CatalogLifecycleDirectory.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private final InpatientBedProfile profile = mock(InpatientBedProfile.class);
    private final CatalogLifecycleDirectory.CatalogOperationalSnapshot pricing = mock(CatalogLifecycleDirectory.CatalogOperationalSnapshot.class);
    private final CatalogLifecycleDirectory.CatalogItemSnapshot item = mock(CatalogLifecycleDirectory.CatalogItemSnapshot.class);
    private final MasterDataViews.OrganizationAdoptionView adoption = mock(MasterDataViews.OrganizationAdoptionView.class);
    private final MasterDataViews.PriceView price = mock(MasterDataViews.PriceView.class);
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Shanghai"));
    private final InpatientBillingService service = new InpatientBillingService(episodes, encounters, requests, tasks,
            locations, beds, bedDays, serviceLocations, billing, catalog, contexts);

    @BeforeEach void arrange() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "test", Set.of(),
                3L, 4L, "DEPARTMENT", Set.of(3L), Set.of(4L)));
        var episode = mock(CareEpisode.class);
        when(episode.id()).thenReturn(10L);when(episode.organizationId()).thenReturn(3L);
        when(episode.status()).thenReturn(CareEpisodeStatus.ADMITTED);
        when(episode.startAt()).thenReturn(today.atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant());
        when(episodes.findByIdAndTenantId(10L, 1L)).thenReturn(Optional.of(episode));
        var encounter = mock(InpatientEncounter.class);when(encounter.id()).thenReturn(20L);
        when(encounters.findByTenantIdAndEpisodeId(1L,10L)).thenReturn(Optional.of(encounter));
        when(billing.account(1L,20L,"CNY")).thenReturn(InpatientBillingDirectory.AccountSnapshot.unopened());
        var history = new EncounterLocationHistory(1L,20L,30L,"入院",2L,episode.startAt());
        when(locations.findByTenantIdAndEncounterIdOrderByStartAtAscIdAsc(1L,20L)).thenReturn(List.of(history));
        when(beds.findById(30L)).thenReturn(Optional.of(profile));
        when(profile.tenantId()).thenReturn(1L);when(profile.chargeCatalogItemId()).thenReturn(40L);
        when(profile.dailyBedRate()).thenReturn(new BigDecimal("999"));
        var location = mock(ServiceLocation.class);when(location.code()).thenReturn("BED-1");when(location.name()).thenReturn("01床");
        when(serviceLocations.findByIdAndTenantId(30L,1L)).thenReturn(Optional.of(location));
        when(catalog.resolve(1L,40L,3L,null,"SALE",today)).thenReturn(pricing);
        when(pricing.item()).thenReturn(item);when(item.chargeable()).thenReturn(true);when(item.status()).thenReturn("ACTIVE");
        when(pricing.adoption()).thenReturn(adoption);when(adoption.chargeable()).thenReturn(true);when(adoption.sdStatus()).thenReturn("ACTIVE");
        when(pricing.price()).thenReturn(price);when(price.sdStatus()).thenReturn("ACTIVE");
        when(price.price()).thenReturn(new BigDecimal("20"));when(price.currencyCode()).thenReturn("CNY");
    }

    @Test void uses_effective_catalog_price_and_accepts_an_explicit_zero_price() {
        assertEquals(new BigDecimal("20.000000"), service.account(10L,"CNY").estimatedBedAmount());
        when(price.price()).thenReturn(BigDecimal.ZERO);
        assertEquals(new BigDecimal("0.000000"), service.account(10L,"CNY").estimatedBedAmount());
        verify(profile,never()).dailyBedRate();
    }

    @Test void catalog_read_failure_is_not_replaced_with_the_bed_profile_rate() {
        var failure = new org.springframework.dao.DataAccessResourceFailureException("catalog unavailable");
        when(catalog.resolve(1L,40L,3L,null,"SALE",today)).thenThrow(failure);
        assertSame(failure,assertThrows(RuntimeException.class,()->service.account(10L,"CNY")));
        verify(profile,never()).dailyBedRate();
        verify(billing,never()).postBedDay(any());
    }

    private InpatientCareRequest pricedOrder() {
        var request=mock(InpatientCareRequest.class);
        when(request.id()).thenReturn(50L);when(request.requestNo()).thenReturn("ORDER-50");
        when(request.orderCategory()).thenReturn("SERVICE");when(request.status()).thenReturn(InpatientCareRequestStatus.ACTIVE);
        when(request.catalogItemId()).thenReturn(60L);when(request.priceId()).thenReturn(61L);
        when(request.priceRevision()).thenReturn(0L);when(request.priceType()).thenReturn("SALE");
        when(request.unitPrice()).thenReturn(new BigDecimal("18"));when(request.totalAmount()).thenReturn(new BigDecimal("18"));
        when(request.currencyCode()).thenReturn("CNY");when(request.authoredAt()).thenReturn(today.atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant());
        when(requests.findByTenantIdAndEncounterIdAndStatusInOrderByAuthoredAtAscIdAsc(1L,20L,
                List.of(InpatientCareRequestStatus.ACTIVE,InpatientCareRequestStatus.COMPLETED))).thenReturn(List.of(request));
        return request;
    }

    @ParameterizedTest
    @EnumSource(value=InpatientOrderTaskStatus.class, names={"EXECUTED","SKIPPED","CANCELLED"})
    void an_active_order_with_only_terminal_tasks_does_not_invent_another_estimate(InpatientOrderTaskStatus status) {
        pricedOrder();var task=mock(InpatientOrderTask.class);when(task.status()).thenReturn(status);
        when(tasks.findByTenantIdAndRequestIdOrderByOccurrenceNoAsc(1L,50L)).thenReturn(List.of(task));
        var account=service.account(10L,"CNY");
        assertEquals(new BigDecimal("0.000000"),account.estimatedOrderAmount());
        assertTrue(account.costLines().stream().noneMatch(line->"ORDER".equals(line.category())));
    }

    @Test void only_actual_pending_tasks_contribute_to_the_estimate() {
        pricedOrder();var done=mock(InpatientOrderTask.class);when(done.status()).thenReturn(InpatientOrderTaskStatus.EXECUTED);
        var pending=mock(InpatientOrderTask.class);when(pending.id()).thenReturn(70L);
        when(pending.status()).thenReturn(InpatientOrderTaskStatus.PLANNED);
        when(pending.scheduledAt()).thenReturn(today.atStartOfDay(ZoneId.of("Asia/Shanghai")).toInstant());
        when(tasks.findByTenantIdAndRequestIdOrderByOccurrenceNoAsc(1L,50L)).thenReturn(List.of(done,pending));
        var account=service.account(10L,"CNY");
        assertEquals(new BigDecimal("18.000000"),account.estimatedOrderAmount());
        var line=account.costLines().stream().filter(value->"ORDER".equals(value.category())).findFirst().orElseThrow();
        assertEquals(70L,line.sourceId());assertEquals(pending.scheduledAt(),line.occurredAt());
    }

    @Test void missing_order_price_or_currency_is_not_omitted_from_the_account() {
        var request=pricedOrder();when(request.unitPrice()).thenReturn(null);
        assertEquals("INPATIENT_ORDER_PRICE_MISSING",assertThrows(BusinessException.class,()->service.account(10L,"CNY")).code());
        when(request.unitPrice()).thenReturn(new BigDecimal("18"));when(request.currencyCode()).thenReturn(null);
        assertEquals("INPATIENT_ORDER_PRICE_MISSING",assertThrows(BusinessException.class,()->service.account(10L,"CNY")).code());
        when(request.currencyCode()).thenReturn("USD");
        assertEquals(new BigDecimal("0.000000"),service.account(10L,"CNY").estimatedOrderAmount());
    }

    @ParameterizedTest
    @CsvSource({
            "no-history,LOCATION_MISSING", "no-location,LOCATION_MISSING", "no-profile,PROFILE_MISSING",
            "foreign-profile,PROFILE_MISSING", "no-catalog,CATALOG_MISSING", "no-snapshot,CATALOG_INACTIVE",
            "no-item,CATALOG_INACTIVE", "inactive-item,CATALOG_INACTIVE", "unchargeable-item,CATALOG_INACTIVE",
            "no-adoption,CATALOG_INACTIVE", "inactive-adoption,CATALOG_INACTIVE", "unchargeable-adoption,CATALOG_INACTIVE",
            "no-price,PRICE_MISSING", "inactive-price,PRICE_MISSING", "null-amount,PRICE_MISSING",
            "negative-price,PRICE_MISSING", "wrong-currency,CURRENCY_MISMATCH"
    })
    void incomplete_bed_facts_never_produce_a_complete_estimate(String defect, String code) {
        switch(defect) {
            case "no-history" -> when(locations.findByTenantIdAndEncounterIdOrderByStartAtAscIdAsc(1L,20L)).thenReturn(List.of());
            case "no-location" -> when(serviceLocations.findByIdAndTenantId(30L,1L)).thenReturn(Optional.empty());
            case "no-profile" -> when(beds.findById(30L)).thenReturn(Optional.empty());
            case "foreign-profile" -> when(profile.tenantId()).thenReturn(99L);
            case "no-catalog" -> when(profile.chargeCatalogItemId()).thenReturn(null);
            case "no-snapshot" -> when(catalog.resolve(1L,40L,3L,null,"SALE",today)).thenReturn(null);
            case "no-item" -> when(pricing.item()).thenReturn(null);
            case "inactive-item" -> when(item.status()).thenReturn("INACTIVE");
            case "unchargeable-item" -> when(item.chargeable()).thenReturn(false);
            case "no-adoption" -> when(pricing.adoption()).thenReturn(null);
            case "inactive-adoption" -> when(adoption.sdStatus()).thenReturn("INACTIVE");
            case "unchargeable-adoption" -> when(adoption.chargeable()).thenReturn(false);
            case "no-price" -> when(pricing.price()).thenReturn(null);
            case "inactive-price" -> when(price.sdStatus()).thenReturn("INACTIVE");
            case "null-amount" -> when(price.price()).thenReturn(null);
            case "negative-price" -> when(price.price()).thenReturn(new BigDecimal("-1"));
            case "wrong-currency" -> when(price.currencyCode()).thenReturn("USD");
            default -> fail("Unknown fixture: " + defect);
        }
        var failure=assertThrows(BusinessException.class,()->service.account(10L,"CNY"));
        assertEquals("INPATIENT_BED_DAY_"+code,failure.code());
        verify(profile,never()).dailyBedRate();
        verify(billing,never()).postBedDay(any());
    }
}
