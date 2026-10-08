package com.rhn.portal.dashboard;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.workmanagement.api.WorkSummaryDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@ExtendWith(MockitoExtension.class)
class PortalSummaryTruthTest {
    @Mock JdbcTemplate jdbc;
    @Mock ExecutionContextProvider contexts;
    @Mock WorkSummaryDirectory work;
    @InjectMocks PortalSummaryService service;

    @BeforeEach void context() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "test", "test", Set.of(),
                20L, 30L, "ORGANIZATION", Set.of(20L), Set.of(30L)));
    }

    private void timezone(String value) {
        timezone(value, null);
    }

    private void timezone(String organization, String tenant) {
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<ResultSetExtractor<String>>any(), eq(1L), eq(20L)))
                .thenAnswer(call -> {
                    var result = mock(java.sql.ResultSet.class);
                    when(result.next()).thenReturn(true);
                    when(result.getString(1)).thenReturn(organization);
                    if (organization == null || organization.isBlank()) when(result.getString(2)).thenReturn(tenant);
                    ResultSetExtractor<String> extractor = call.getArgument(1);
                    return extractor.extractData(result);
                });
    }

    @ParameterizedTest @NullSource @ValueSource(strings = {"", " ", "Invalid/Zone"})
    void missing_or_invalid_timezone_cannot_silently_become_shanghai(String value) {
        timezone(value);
        var error = assertThrows(BusinessException.class, service::current);
        assertTrue(error.code().startsWith("PORTAL_ORGANIZATION_TIMEZONE_"));
        verify(jdbc, never()).queryForObject(anyString(), eq(Long.class), any(Object[].class));
        verifyNoInteractions(work);
    }

    @Test void missing_count_cannot_be_reported_as_zero() {
        timezone("UTC");
        assertThrows(IllegalStateException.class, service::current);
        verifyNoInteractions(work);
    }

    @Test void actual_zero_counts_remain_valid() {
        timezone("UTC");
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(0L);
        when(work.tasks()).thenReturn(new WorkSummaryDirectory.TaskSummary(0, 0, 0, 0));
        when(work.notifications()).thenReturn(new WorkSummaryDirectory.NotificationSummary(0, 0));
        var value = service.current();
        assertEquals(0, value.registeredToday());
        assertEquals(0, value.completedToday());
        assertEquals(0, value.activeResidents());
        var start = org.mockito.ArgumentCaptor.forClass(java.sql.Timestamp.class);
        verify(jdbc).queryForObject(contains("DT_REGD"), eq(Long.class), eq(1L), eq(20L), eq(30L), start.capture());
        assertEquals(java.time.LocalDate.now(java.time.ZoneId.of("UTC")).atStartOfDay(java.time.ZoneId.of("UTC")).toInstant(),
                start.getValue().toInstant());
    }

    @Test void an_unconfigured_organization_uses_the_actual_tenant_timezone() {
        timezone(null, "America/Los_Angeles");
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(0L);
        when(work.tasks()).thenReturn(new WorkSummaryDirectory.TaskSummary(0, 0, 0, 0));
        when(work.notifications()).thenReturn(new WorkSummaryDirectory.NotificationSummary(0, 0));
        service.current();
        var start = org.mockito.ArgumentCaptor.forClass(java.sql.Timestamp.class);
        verify(jdbc).queryForObject(contains("DT_REGD"), eq(Long.class), eq(1L), eq(20L), eq(30L), start.capture());
        var zone = java.time.ZoneId.of("America/Los_Angeles");
        assertEquals(java.time.LocalDate.now(zone).atStartOfDay(zone).toInstant(), start.getValue().toInstant());
    }

    @Test void a_valid_tenant_timezone_does_not_hide_an_invalid_organization_timezone() {
        timezone("Invalid/Zone", "UTC");
        assertThrows(BusinessException.class, service::current);
        verifyNoInteractions(work);
    }
}
