package com.rhn.outpatient.triage;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.api.BusinessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import java.util.Set;
import java.util.Optional;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.RuleAssessment;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OutpatientTriageServiceTest {

    private static final Long TENANT_ID = 101L;

    private OutpatientTriageRepository triageRepository;
    private OutpatientRegistrationDirectory registrationDirectory;
    private OutpatientTriageService service;
    private ExecutionContextProvider contexts;
    private TriageAssessmentEngine assessments;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT_ID);
        triageRepository = mock(OutpatientTriageRepository.class);
        registrationDirectory = mock(OutpatientRegistrationDirectory.class);
        contexts = mock(ExecutionContextProvider.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID, 1L, "test", "test", Set.of(),
                902L, 903L, "ORGANIZATION", Set.of(902L), Set.of(903L)));
        assessments = mock(TriageAssessmentEngine.class);
        service = new OutpatientTriageService(
                triageRepository,
                registrationDirectory,
                mock(ClinicalValidationDirectory.class),
                assessments, contexts);
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void pendingQueueUsesOrganizationScopeAndOnlyKeepsActiveCandidates() {
        LocalDate date = LocalDate.of(2026, 9, 11);
        ReceptionQueueItem waiting = queueItem(1L, 11L, "WAITING", "REGISTERED", "全科医疗科", 21L, "13800001111");
        ReceptionQueueItem cancelled = queueItem(2L, 12L, "WAITING", "CANCELLED", "内科门诊", 22L, "13800002222");
        ReceptionQueueItem completed = queueItem(3L, 13L, "COMPLETED", "REGISTERED", "外科门诊", 23L, "13800003333");

        when(registrationDirectory.organizationQueue(date)).thenReturn(List.of(waiting, cancelled, completed));
        when(triageRepository.findByTenantIdAndEncounterIdInAndTriageTimeBetween(
                eq(TENANT_ID), anyCollection(), any(Instant.class), any(Instant.class))).thenReturn(List.of());

        List<TriageContracts.PendingEncounterResponse> result = service.listPendingEncounters(date);

        assertThat(result).singleElement().satisfies(item -> {
            assertThat(item.encounterId()).isEqualTo(11L);
            assertThat(item.departmentId()).isEqualTo(21L);
            assertThat(item.departmentName()).isEqualTo("全科医疗科");
            assertThat(item.phone()).isEqualTo("13800001111");
            assertThat(item.age()).isEqualTo(40);
            assertThat(item.triaged()).isFalse();
        });
        verify(registrationDirectory).organizationQueue(date);
        verify(registrationDirectory, never()).queue(date);
    }

    @Test
    void createWithoutOrganizationWritesToCurrentNonSeedOrganization() {
        var request = mock(TriageContracts.CreateTriageRequest.class);
        when(request.organizationId()).thenReturn(null);
        when(request.encounterId()).thenReturn(null);
        when(request.patientName()).thenReturn("测试患者");
        when(request.gender()).thenReturn("UNKNOWN");
        when(request.triageLevel()).thenReturn("LEVEL_4_NON_URGENT");
        when(assessments.assessRules(any())).thenReturn(new RuleAssessment("LEVEL_4_NON_URGENT", "普通", List.of(), List.of()));
        when(triageRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var result = service.createTriageRecord(request);
        assertThat(result.organizationId()).isEqualTo(902L);
        assertThat(result.tenantId()).isEqualTo(TENANT_ID);
    }

    @Test
    void existingRecordCannotBypassOrganizationAuthorization() {
        var record = new OutpatientTriageRecord(TENANT_ID, 999L, "TR-TEST", "测试患者", "UNKNOWN");
        when(triageRepository.findByTenantIdAndId(TENANT_ID, 1L)).thenReturn(Optional.of(record));
        assertThatThrownBy(() -> service.getTriageRecord(1L)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.bindEncounter(1L, 2L, 3L)).isInstanceOf(BusinessException.class);
        verify(triageRepository, never()).save(any());
    }

    @Test
    void omittedOrganizationUsesCurrentContextForListAndStatistics() {
        var page = PageRequest.of(0, 20);
        when(triageRepository.searchTriageRecords(eq(TENANT_ID), eq(902L), any(), any(),
                any(), any(), any(), eq(page))).thenReturn(Page.empty());
        when(triageRepository.findTodayRecords(eq(TENANT_ID), eq(902L), any(), any())).thenReturn(List.of());
        service.searchTriageRecords(null, LocalDate.now(), null, null, null, page);
        service.todayStatistics(null, LocalDate.now());
        verify(triageRepository).searchTriageRecords(eq(TENANT_ID), eq(902L), any(), any(),
                any(), any(), any(), eq(page));
        verify(triageRepository).findTodayRecords(eq(TENANT_ID), eq(902L), any(), any());
    }

    @Test
    void unauthorizedOrganizationIsRejectedBeforeQuerying() {
        assertThatThrownBy(() -> service.todayStatistics(999L, LocalDate.now()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("有权访问");
        verify(triageRepository, never()).findTodayRecords(any(), any(), any(), any());
    }

    @Test
    void missingWorkContextCannotFallBackToSeedOrganization() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID, 1L, "test", "test", Set.of()));
        assertThatThrownBy(() -> service.todayStatistics(null, LocalDate.now()))
                .isInstanceOf(BusinessException.class);
        verify(triageRepository, never()).findTodayRecords(any(), any(), any(), any());
    }

    private static ReceptionQueueItem queueItem(Long registrationId, Long encounterId, String queueStatus,
                                                String registrationStatus, String departmentName,
                                                Long departmentId, String phone) {
        return new ReceptionQueueItem(
                registrationId, null, null, encounterId, registrationId + 100, registrationId + 200,
                registrationId + 300, "HR" + registrationId, "患者" + registrationId, "MALE",
                LocalDate.of(1985, 12, 20), "RG" + registrationId, "A" + registrationId, 1,
                0, "WINDOW", "GENERAL", registrationStatus, queueStatus, null, "普通门诊服务",
                "一楼诊区", Instant.parse("2026-09-11T01:00:00Z"), null, null, null,
                0, 0, null, Instant.parse("2026-09-12T00:00:00Z"), "挂号员", departmentName,
                "上午", null, null, null, null, departmentId, phone);
    }
}
