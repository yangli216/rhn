package com.rhn;

import com.rhn.outpatient.api.EncounterFlowDirectory;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OutpatientFlowRangeTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired EncounterFlowDirectory encounters;

    @Test
    void board_counts_and_searches_the_whole_date_range_beyond_200_and_1000_encounters() throws Exception {
        LocalDate first = LocalDate.of(2030, 2, 1);
        Instant from = start(first);
        long oldest = GlobalIds.next();
        List<Object[]> rows = new ArrayList<>();
        rows.add(row(oldest, from, "IN_PROGRESS"));
        for (int i = 1; i < 1005; i++) {
            rows.add(row(GlobalIds.next(), start(first.plusDays(1)).plusSeconds(i), "REGISTERED"));
        }
        // Both half-open range boundaries are deliberate: the first record is included,
        // records before the first day and at the following midnight are excluded.
        rows.add(row(GlobalIds.next(), from.minusSeconds(1), "REGISTERED"));
        rows.add(row(GlobalIds.next(), start(first.plusDays(2)), "REGISTERED"));
        insert(rows);

        JsonNode board = board(first, first.plusDays(1), null, null);
        assertEquals(1005, board.path("summary").path("totalCount").asInt());
        assertEquals(1004, board.path("summary").path("waitingConsultationCount").asInt());
        assertEquals(1, board.path("summary").path("inConsultationCount").asInt());
        assertEquals(1005, board.path("visits").size());
        var ids = new HashSet<String>();
        board.path("visits").forEach(visit -> assertTrue(ids.add(visit.path("encounterId").asString())));
        assertTrue(ids.contains(Long.toString(oldest)));

        JsonNode searched = board(first, first.plusDays(1), null, "RANGE-" + oldest);
        assertEquals(1, searched.path("summary").path("totalCount").asInt());
        assertEquals(Long.toString(oldest), searched.path("visits").get(0).path("encounterId").asString());
        JsonNode filtered = board(first, first.plusDays(1), "IN_CONSULTATION", null);
        assertEquals(1, filtered.path("visits").size());
        assertEquals(1, filtered.path("summary").path("inConsultationCount").asInt());
        assertEquals(Long.toString(oldest), filtered.path("visits").get(0).path("encounterId").asString());
    }

    @Test
    void range_reader_preserves_tenant_organization_and_department_isolation() {
        Instant from = start(LocalDate.of(2030, 3, 1));
        Instant to = from.plusSeconds(3600);
        insert(List.<Object[]>of(row(GlobalIds.next(), from, "REGISTERED")));
        Long tenant = Long.valueOf(TENANT), organization = Long.valueOf(ORGANIZATION), department = Long.valueOf(DEPARTMENT);
        assertEquals(1, encounters.findInRange(tenant, organization, department, from, to).size());
        assertTrue(encounters.findInRange(-1L, organization, department, from, to).isEmpty());
        assertTrue(encounters.findInRange(tenant, -1L, department, from, to).isEmpty());
        assertTrue(encounters.findInRange(tenant, organization, -1L, from, to).isEmpty());
    }

    @Test
    void genuinely_empty_range_has_zero_counts_and_no_visits() throws Exception {
        LocalDate date = LocalDate.of(2030, 4, 1);
        JsonNode board = board(date, date, null, null);
        assertEquals(0, board.path("visits").size());
        board.path("summary").forEach(count -> assertEquals(0, count.asInt()));
    }

    private JsonNode board(LocalDate from, LocalDate to, String flowStatus, String keyword) throws Exception {
        var request = get("/api/outpatient-flow").with(rhnWorkContext())
                .param("dateFrom", from.toString()).param("dateTo", to.toString());
        if (flowStatus != null) request.param("flowStatus", flowStatus);
        if (keyword != null) request.param("keyword", keyword);
        return json(mockMvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private Object[] row(long id, Instant registeredAt, String status) {
        return new Object[] {id, Long.valueOf(TENANT), 362387869790213L, "RANGE-" + id,
                Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), status, Timestamp.from(registeredAt), "OUTPATIENT"};
    }

    private void insert(List<Object[]> rows) {
        jdbc.batchUpdate("""
                insert into RHN_VIS_ENC (ID_ENC, ID_TNT, ID_PAT, CD_ENC_NO, ID_ORG, ID_DEPT,
                    SD_STATUS, DT_REGD, SD_ENC_CLASS) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, rows);
    }

    private Instant start(LocalDate date) {
        return date.atStartOfDay(ZoneId.systemDefault()).toInstant();
    }
}
