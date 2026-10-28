package com.rhn;

import com.rhn.billing.api.InsuranceDebugViews.*;
import com.rhn.billing.application.InsuranceDebugService;
import com.rhn.billing.infrastructure.insurance.chs.ChsExchange;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/** 调试控制台：迁移与权限、范围过滤、脱敏留存、原始报文保护与读取脱敏。 */
class InsuranceDebugServiceTest extends StubbedExecutionContextTestSupport {
    private static final Long TENANT = 362387869790209L;
    private static final String REQUEST = "{\"infno\":\"2207\",\"input\":{\"data\":{\"mdtrt_cert_no\":\"CERT-SECRET-1\",\"psn_no\":\"12345678901\"}}}";
    private static final String RESPONSE = "{\"infcode\":0,\"output\":{\"psn_name\":\"张三丰\"}}";

    @Autowired InsuranceDebugService service;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach void setUp() { TenantContext.set(TENANT); as(Set.of("INSURANCE_DEBUG.VIEW", "INSURANCE_DEBUG.CONFIGURE")); service.settings(); }

    @AfterEach void tearDown() {
        jdbc.update("delete from RHN_INS_EXCH_LOG"); jdbc.update("delete from RHN_INS_DBG_CFG");
        service.settings(); // 重新读取以刷新进程内缓存，避免上一个用例的配置泄漏
        TenantContext.clear();
    }

    void as(Set<String> authorities) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT, 7L, "debugger", "corr-debug", authorities));
    }

    ChsExchange exchange(String infno, ChsExchange.Outcome outcome, String infcode) {
        return new ChsExchange(infno, Instant.now(), 12, 200, infcode, null, outcome, REQUEST, RESPONSE);
    }

    UpdateDebugSettings enable(String scope, List<String> selected, String retention, Integer hours, boolean confirmRaw, Long revision) {
        return new UpdateDebugSettings(true, scope, selected, retention, 7, hours, confirmRaw, revision);
    }

    ExchangePage await(int expected) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            var page = service.exchanges(null, null, null, null, null, false, null, 0, 50);
            if (page.totalElements() >= expected) return page;
            Thread.sleep(50);
        }
        return service.exchanges(null, null, null, null, null, false, null, 0, 50);
    }

    @Test void migrationSeedsPermissionsAndDefaultsToDisabled() {
        assertThat(jdbc.queryForList("select CD_ACC_PERM from RHN_SYS_ACC_PERM where CD_RSRC = 'INSURANCE_DEBUG' order by 1", String.class))
                .containsExactly("INSURANCE_DEBUG.CONFIGURE", "INSURANCE_DEBUG.RAW", "INSURANCE_DEBUG.REVERSE", "INSURANCE_DEBUG.VIEW");
        var settings = service.settings();
        assertThat(settings.enabled()).isFalse();
        assertThat(settings.effectivelyEnabled()).isFalse();
        assertThat(settings.scope()).isEqualTo("IMPORTANT");
        assertThat(settings.retention()).isEqualTo("REDACTED");
    }

    @Test void recordsNothingWhileDisabled() throws Exception {
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        Thread.sleep(200);
        assertThat(service.exchanges(null, null, null, null, null, false, null, 0, 20).totalElements()).isZero();
    }

    @Test void importantScopeKeepsSettlementAndOnlySummaryOfOutOfScopeFailures() throws Exception {
        service.update(enable("IMPORTANT", null, "REDACTED", null, false, null));
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        service.record(exchange("1101", ChsExchange.Outcome.OK, "0"));
        service.record(exchange("1101", ChsExchange.Outcome.TIMEOUT, null));
        var page = await(2);
        assertThat(page.totalElements()).isEqualTo(2);
        var settled = page.content().stream().filter(row -> row.infno().equals("2207")).findFirst().orElseThrow();
        var failed = page.content().stream().filter(row -> row.infno().equals("1101")).findFirst().orElseThrow();
        assertThat(settled.retention()).isEqualTo("REDACTED");
        assertThat(failed.retention()).isEqualTo("SUMMARY");
        assertThat(failed.outcome()).isEqualTo("TIMEOUT");
        var detail = service.exchange(settled.id());
        assertThat(detail.request()).doesNotContain("CERT-SECRET-1").contains("****");
        assertThat(detail.response()).doesNotContain("张三丰");
        assertThat(service.exchange(failed.id()).request()).isNull();
    }

    @Test void selectedScopeOnlyRecordsChosenInfnos() throws Exception {
        service.update(enable("SELECTED", List.of("2208"), "REDACTED", null, false, null));
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        service.record(exchange("2208", ChsExchange.Outcome.OK, "0"));
        var page = await(1);
        Thread.sleep(200);
        page = service.exchanges(null, null, null, null, null, false, null, 0, 20);
        assertThat(page.content()).extracting(ExchangeSummary::infno).containsExactly("2208");
    }

    @Test void selectedScopeRequiresKnownInfnos() {
        assertThatThrownBy(() -> service.update(enable("SELECTED", List.of(), "REDACTED", null, false, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_SELECTED_REQUIRED"));
        assertThatThrownBy(() -> service.update(enable("SELECTED", List.of("9999"), "REDACTED", null, false, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_INFNO_UNKNOWN"));
    }

    @Test void rawRetentionNeedsPermissionConfirmationAndShortAutoDisable() {
        assertThatThrownBy(() -> service.update(enable("ALL", null, "RAW", 4, true, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_RAW_FORBIDDEN"));
        as(Set.of("INSURANCE_DEBUG.VIEW", "INSURANCE_DEBUG.CONFIGURE", "INSURANCE_DEBUG.RAW"));
        assertThatThrownBy(() -> service.update(enable("ALL", null, "RAW", 4, false, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_RAW_UNCONFIRMED"));
        assertThatThrownBy(() -> service.update(enable("ALL", null, "RAW", null, true, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_RAW_DURATION"));
        assertThatThrownBy(() -> service.update(enable("ALL", null, "RAW", 48, true, null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_RAW_DURATION"));
        var saved = service.update(enable("ALL", null, "RAW", 4, true, null));
        assertThat(saved.retention()).isEqualTo("RAW");
        assertThat(saved.enabledUntil()).isNotNull();
    }

    @Test void rawPayloadIsOnlyVisibleToRawReaders() throws Exception {
        as(Set.of("INSURANCE_DEBUG.VIEW", "INSURANCE_DEBUG.CONFIGURE", "INSURANCE_DEBUG.RAW"));
        service.update(enable("ALL", null, "RAW", 2, true, null));
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        var id = await(1).content().get(0).id();
        assertThat(service.exchange(id).request()).contains("CERT-SECRET-1");
        assertThat(service.exchange(id).rawVisible()).isTrue();
        as(Set.of("INSURANCE_DEBUG.VIEW"));
        var masked = service.exchange(id);
        assertThat(masked.rawVisible()).isFalse();
        assertThat(masked.request()).doesNotContain("CERT-SECRET-1");
    }

    @Test void initialSaveWithZeroRevisionSucceeds() {
        var initial = service.settings();
        assertThat(initial.revision()).isZero();
        var saved = service.update(enable("IMPORTANT", null, "REDACTED", null, false, initial.revision()));
        assertThat(saved.revision()).isZero();
        var updated = service.update(enable("ALL", null, "REDACTED", null, false, saved.revision()));
        assertThat(updated.revision()).isEqualTo(1L);
    }

    @Test void staleRevisionIsRejected() {
        var first = service.update(enable("ALL", null, "REDACTED", null, false, null));
        service.update(enable("ALL", null, "REDACTED", null, false, first.revision()));
        assertThatThrownBy(() -> service.update(enable("ALL", null, "REDACTED", null, false, first.revision())))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.code()).isEqualTo("INSURANCE_DEBUG_REVISION_CONFLICT"));
    }

    @Test void expiredAutoDisableStopsRecordingAndPurgeRemovesExpiredRows() throws Exception {
        service.update(enable("ALL", null, "REDACTED", 1, false, null));
        jdbc.update("update RHN_INS_DBG_CFG set DT_ENABLED_UNTIL = ?", java.sql.Timestamp.from(Instant.now().minusSeconds(60)));
        service.settings();
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        Thread.sleep(200);
        assertThat(jdbc.queryForObject("select count(*) from RHN_INS_EXCH_LOG", Long.class)).isZero();
        jdbc.update("insert into RHN_INS_EXCH_LOG (ID_EXCH_LOG, ID_TNT, CD_INFNO, DT_STARTED, QTY_ELAPSED_MS, SD_OUTCOME, SD_RETAIN, "
                + "DT_EXPIRES, DT_CREATED) values (1, ?, '2207', ?, 1, 'OK', 'SUMMARY', ?, ?)", TENANT,
                java.sql.Timestamp.from(Instant.now()), java.sql.Timestamp.from(Instant.now().minusSeconds(5)), java.sql.Timestamp.from(Instant.now()));
        service.purgeExpired();
        assertThat(jdbc.queryForObject("select count(*) from RHN_INS_EXCH_LOG", Long.class)).isZero();
    }

    @Test void exchangesMadeForAClaimAreLinkedAndFilterable() throws Exception {
        service.update(enable("ALL", null, "REDACTED", null, false, null));
        com.rhn.billing.infrastructure.insurance.chs.ChsExchangeScope.within(362387869990001L, () -> {
            service.record(exchange("2208", ChsExchange.Outcome.OK, "0")); return null; });
        service.record(exchange("2207", ChsExchange.Outcome.OK, "0"));
        await(2);
        var linked = service.exchanges(null, null, null, null, null, false, "362387869990001", 0, 20);
        assertThat(linked.content()).extracting(ExchangeSummary::infno).containsExactly("2208");
        assertThat(linked.content().get(0).claimId()).isEqualTo("362387869990001");
    }
}
