package com.rhn.treatment.application;

import com.rhn.billing.api.SettlementAuthorizationDirectory;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.MedicationFulfillmentDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.infrastructure.SkinTestEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SkinTestApplicationServiceTest {
    @Mock private SkinTestEventRepository events;
    @Mock private MedicationRequestDirectory medicationRequests;
    @Mock private ResidentDirectory residents;
    @Mock private SettlementAuthorizationDirectory settlements;
    @Mock private MedicationFulfillmentDirectory fulfillment;
    @Mock private AllergyDirectory allergies;
    @Mock private ExecutionContextProvider contextProvider;
    @Mock private DomainEventPublisher eventPublisher;

    private SkinTestApplicationService service;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeEach
    void setUp() {
        ExecutionContext context = new ExecutionContext(1L, 2L, "nurse", "test", Set.of(),
                10L, 20L, "DEPARTMENT", Set.of(10L), Set.of(20L), 3L);
        when(contextProvider.requireCurrent()).thenReturn(context);
        lenient().when(events.findByTenantIdAndMedicationRequestIdInOrderByStartedAtDesc(1L, List.of(100L)))
                .thenReturn(List.of());
        lenient().when(residents.requireSnapshot(30L)).thenReturn(new ResidentDirectory.ResidentSnapshot(
                30L, "HR001", "测试患者", "FEMALE", LocalDate.of(1990, 1, 1), null, false));
        service = new SkinTestApplicationService(events, medicationRequests, residents, settlements,
                fulfillment, allergies, contextProvider, eventPublisher);
    }

    @Test
    void diluted_solution_can_start_before_medication_settlement_and_dispense() {
        MedicationRequestSnapshot request = request("DILUTED_SOLUTION", null);
        when(medicationRequests.activeForExecution(10L, 20L)).thenReturn(List.of(request));

        var item = service.worklist(null, null, null).getFirst();

        assertThat(item.status()).isEqualTo("PENDING");
        assertThat(item.configuredSolutionMode()).isEqualTo("DILUTED_SOLUTION");
        assertThat(item.settlementRequiredBeforeStart()).isFalse();
        assertThat(item.dispenseRequiredBeforeStart()).isFalse();
        verifyNoInteractions(settlements, fulfillment);
    }

    @Test
    void attribute_definition_default_does_not_override_medication_master_data() {
        MedicationRequestSnapshot request = request("DILUTED_SOLUTION", "ORIGINAL_SOLUTION",
                "DEFINITION_DEFAULT");
        when(medicationRequests.activeForExecution(10L, 20L)).thenReturn(List.of(request));

        var item = service.worklist(null, null, null).getFirst();

        assertThat(item.configuredSolutionMode()).isEqualTo("DILUTED_SOLUTION");
        assertThat(item.status()).isEqualTo("PENDING");
        verifyNoInteractions(settlements, fulfillment);
    }

    @Test
    void resolved_original_solution_override_requires_settlement_then_dispense() {
        MedicationRequestSnapshot request = request("DILUTED_SOLUTION", "ORIGINAL_SOLUTION");
        when(medicationRequests.activeForExecution(10L, 20L)).thenReturn(List.of(request));
        when(settlements.finalizedSettlementForRequest(1L, 100L, "MEDICATION_REQUEST"))
                .thenReturn(Optional.empty());

        var waitingSettlement = service.worklist(null, null, null).getFirst();
        assertThat(waitingSettlement.configuredSolutionMode()).isEqualTo("ORIGINAL_SOLUTION");
        assertThat(waitingSettlement.status()).isEqualTo("WAITING_SETTLEMENT");
        assertThat(waitingSettlement.settlementRequiredBeforeStart()).isTrue();
        assertThat(waitingSettlement.dispenseRequiredBeforeStart()).isTrue();

        when(settlements.finalizedSettlementForRequest(1L, 100L, "MEDICATION_REQUEST"))
                .thenReturn(Optional.of(501L));
        when(fulfillment.fulfillmentForRequest(1L, 100L))
                .thenReturn(MedicationFulfillmentDirectory.FulfillmentSnapshot.pending());
        assertThat(service.worklist(null, null, null).getFirst().status()).isEqualTo("WAITING_DISPENSE");

        when(fulfillment.fulfillmentForRequest(1L, 100L)).thenReturn(
                new MedicationFulfillmentDirectory.FulfillmentSnapshot(true, 601L, BigDecimal.ONE, "COMPLETED"));
        assertThat(service.worklist(null, null, null).getFirst().status()).isEqualTo("PENDING");
    }

    @Test
    void start_rejects_execution_parameters_that_override_the_order_snapshot() {
        MedicationRequestSnapshot request = request("ORIGINAL_SOLUTION", null);
        when(medicationRequests.requireForRouting(1L, 100L)).thenReturn(request);

        BusinessException error = assertThrows(BusinessException.class, () -> service.start(
                100L, 4L, true, "NAME_AND_IDENTIFIER", "INTRADERMAL", false,
                null, "临时修改的皮试液", null, null, null, null, "左前臂", 20));

        assertThat(error.code()).isEqualTo("SKIN_TEST_CONFIGURATION_MISMATCH");
    }

    private MedicationRequestSnapshot request(String medicationSolutionMode, String resolvedSolutionMode) {
        return request(medicationSolutionMode, resolvedSolutionMode, "ORGANIZATION");
    }

    private MedicationRequestSnapshot request(String medicationSolutionMode, String resolvedSolutionMode,
                                              String sourceLevel) {
        MedicationRequestSnapshot request = mock(MedicationRequestSnapshot.class);
        when(request.id()).thenReturn(100L);
        when(request.revision()).thenReturn(4L);
        when(request.tenantId()).thenReturn(1L);
        when(request.residentId()).thenReturn(30L);
        when(request.encounterId()).thenReturn(40L);
        when(request.status()).thenReturn("ACTIVE");
        when(request.performerOrganizationId()).thenReturn(10L);
        when(request.performerDepartmentId()).thenReturn(20L);
        when(request.medicationId()).thenReturn(50L);
        when(request.requestNo()).thenReturn("MR001");
        when(request.medicationCode()).thenReturn("MED001");
        when(request.medicationName()).thenReturn("测试注射剂");
        when(request.itemName()).thenReturn("测试注射剂 1g");
        when(request.skinTestRequired()).thenReturn(true);
        when(request.totalAmount()).thenReturn(new BigDecimal("10.00"));
        when(request.selfProvided()).thenReturn(false);
        when(request.medicationSnapshot()).thenReturn(json.readTree("""
                {"skinTestMethod":"INTRADERMAL","skinTestSolutionMode":"%s",
                 "skinTestObservationMinutes":20,"skinTestResultValidityHours":24,
                 "skinTestInstructions":"按主数据方案执行"}
                """.formatted(medicationSolutionMode)));
        if (resolvedSolutionMode != null) {
            when(request.itemAttributeSnapshot()).thenReturn(json.readTree("""
                    {"attributes":{"MED.SKIN_TEST.SOLUTION_MODE":{"value":"%s","sourceLevel":"ORGANIZATION"}}}
                    """.formatted(resolvedSolutionMode).replace("ORGANIZATION", sourceLevel)));
        }
        return request;
    }
}
