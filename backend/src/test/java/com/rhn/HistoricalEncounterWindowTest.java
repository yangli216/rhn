package com.rhn;

import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Persisted encounter selection through the real repository, service and history projection. */
class HistoricalEncounterWindowTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired OutpatientClinicalHistoryDirectory history;
    @MockitoBean ExecutionContextProvider contexts;
    private static final Instant SINCE = Instant.parse("2026-01-01T00:00:00Z");
    private Long residentId;

    @BeforeEach void setup() throws Exception {
        selectContext(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT));
        residentId = createResident();
        TenantContext.set(Long.valueOf(TENANT));
    }

    @AfterEach void clear() { TenantContext.clear(); }

    @Test void newerUnfinishedVisitsDoNotHideCompletedHistoryBeyondRawTopTwenty() {
        Long older = insert(residentId, "COMPLETED", SINCE.plusSeconds(10));
        Long newer = insert(residentId, "COMPLETED", SINCE.plusSeconds(20));
        for (int i = 0; i < 20; i++) insert(residentId, "IN_PROGRESS", SINCE.plusSeconds(100 + i));

        assertThat(history.recentForResident(residentId, null, SINCE, 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(newer, older);
    }

    @Test void filtersStatusAndCurrentEncounterBeforeApplyingTheRequestedLimit() {
        insert(residentId, "COMPLETED", SINCE);
        insert(residentId, "COMPLETED", SINCE.minusSeconds(1));
        var eligible = new ArrayList<Long>();
        for (int i = 1; i <= 11; i++) eligible.add(insert(residentId, "COMPLETED", SINCE.plusSeconds(i)));
        Long current = insert(residentId, "COMPLETED", SINCE.plusSeconds(100));
        for (String state : List.of("REGISTERED", "IN_PROGRESS", "SUSPENDED", "CANCELLED", "TERMINATED", "TRANSFERRED")) {
            for (int i = 0; i < 4; i++) insert(residentId, state, SINCE.plusSeconds(200 + i));
        }

        assertThat(history.recentForResident(residentId, current, SINCE, 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactlyElementsOf(eligible.reversed().subList(0, 10));
        assertThat(history.recentForResident(residentId, current, SINCE.plusSeconds(11), 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(eligible.getLast());
        assertThat(history.recentForResident(residentId, current, SINCE, 100)).hasSize(10);
        assertThat(history.recentForResident(residentId, current, SINCE, 0)).isEmpty();
        assertThat(history.recentForResident(residentId, current, SINCE, 3))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactlyElementsOf(eligible.reversed().subList(0, 3));
        assertThat(history.recentForResident(residentId, current, SINCE, -1)).isEmpty();
    }

    @Test void timeBoundaryIsInclusiveAndAnAbsentWindowDoesNotExcludeOlderVisits() {
        Long before = insert(residentId, "COMPLETED", SINCE.minusSeconds(1));
        Long boundary = insert(residentId, "COMPLETED", SINCE);
        Long after = insert(residentId, "COMPLETED", SINCE.plusSeconds(1));
        assertThat(history.recentForResident(residentId, null, SINCE, 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(after, boundary);
        assertThat(history.recentForResident(residentId, null, null, 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(after, boundary, before);
        assertThat(history.recentForResident(residentId, null, SINCE.plusSeconds(2), 10)).isEmpty();
    }

    @Test void equalTimestampsUseStableIdentityOrderingBeforeLimiting() {
        Long first = insert(residentId, "COMPLETED", SINCE);
        Long second = insert(residentId, "COMPLETED", SINCE);
        Long current = insert(residentId, "COMPLETED", SINCE);
        assertThat(history.recentForResident(residentId, current, SINCE, 2))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(second, first);
    }

    @Test void otherPatientsAndNonOutpatientEncountersDoNotConsumeTheHistoryBudget() throws Exception {
        Long expected = insert(residentId, "COMPLETED", SINCE);
        Long otherResident = createResident();
        for (int i = 0; i < 20; i++) insert(otherResident, "COMPLETED", SINCE.plusSeconds(i + 1));
        Long otherClass = insert(residentId, "COMPLETED", SINCE.plusSeconds(100));
        jdbc.update("update RHN_VIS_ENC set SD_ENC_CLASS='INPATIENT' where ID_ENC=?", otherClass);
        assertThat(history.recentForResident(residentId, null, SINCE, 1))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(expected);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"organization", "department"})
    void historyDoesNotLeakFromAnotherCurrentWorkContext(String changed) {
        insert(residentId, "COMPLETED", SINCE);
        selectContext(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION) + ("organization".equals(changed) ? 1 : 0),
                Long.valueOf(DEPARTMENT) + ("department".equals(changed) ? 1 : 0));
        assertThat(history.recentForResident(residentId, null, SINCE, 10)).isEmpty();
    }

    @Test void tenantBoundaryCannotBeBypassedByPassingAnotherTenantsResidentId() {
        insert(residentId, "COMPLETED", SINCE);
        Long otherTenant = Long.valueOf(TENANT) + 1;
        selectContext(otherTenant, Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT));
        TenantContext.set(otherTenant);
        var error = assertThrows(com.rhn.shared.api.BusinessException.class,
                () -> history.recentForResident(residentId, null, SINCE, 10));
        assertThat(error.code()).isEqualTo("RESIDENT_NOT_FOUND");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"organization", "department"})
    void missingWorkContextIsNotReportedAsAnEmptyClinicalHistory(String missing) {
        selectContext(Long.valueOf(TENANT), "organization".equals(missing) ? null : Long.valueOf(ORGANIZATION),
                "department".equals(missing) ? null : Long.valueOf(DEPARTMENT));
        var error = assertThrows(com.rhn.shared.api.BusinessException.class,
                () -> history.recentForResident(residentId, null, SINCE, 10));
        assertThat(error.code()).isEqualTo("organization".equals(missing)
                ? "ENCOUNTER_CONTEXT_REQUIRED" : "ENCOUNTER_DEPARTMENT_REQUIRED");
        assertThrows(com.rhn.shared.api.BusinessException.class,
                () -> history.recentForResident(residentId, null, SINCE, 0));
    }

    @Test void mergedPatientIdentityStillResolvesToTheCanonicalPatientsHistory() throws Exception {
        Long expected = insert(residentId, "COMPLETED", SINCE);
        Long alias = createResident();
        mockMvc.perform(post("/api/residents/{id}/merge", residentId).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"mergedResidentId":"%s","reason":"历史查询主索引合并测试"}
                """.formatted(alias))).andExpect(status().isOk());
        TenantContext.set(Long.valueOf(TENANT));
        assertThat(history.recentForResident(alias, null, SINCE, 10))
                .extracting(OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot::encounterId)
                .containsExactly(expected);
    }

    private void selectContext(Long tenant, Long organization, Long department) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant, 7L, "doctor", "history-window",
                Set.of(), organization, department, "DEPARTMENT", Set.of(), Set.of()));
    }

    private Long createResident() throws Exception {
        var response = mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content("""
                {"fullName":"历史窗口测试患者","identifiers":[{"system":"9","value":"%s","useType":"SECONDARY"}],
                 "gender":"FEMALE","birthDate":"1992-03-04"}
                """.formatted(UUID.randomUUID()))).andExpect(status().isCreated()).andReturn().getResponse();
        TenantContext.set(Long.valueOf(TENANT));
        return Long.valueOf(json(response.getContentAsString()).get("id").asString());
    }

    private Long insert(Long patient, String state, Instant registeredAt) {
        Long id = GlobalIds.next();
        jdbc.update("""
                insert into RHN_VIS_ENC (ID_ENC, ID_TNT, ID_PAT, CD_ENC_NO, ID_ORG, ID_DEPT,
                    SD_STATUS, SD_ENC_CLASS, DT_REGD, REVISION) values (?, ?, ?, ?, ?, ?, ?, 'OUTPATIENT', ?, 0)
                """, id, Long.valueOf(TENANT), patient, "HIST-" + id, Long.valueOf(ORGANIZATION),
                Long.valueOf(DEPARTMENT), state, Timestamp.from(registeredAt));
        return id;
    }
}
