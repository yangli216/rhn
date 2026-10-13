package com.rhn.platform.numbering.application;

import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.platform.numbering.api.BusinessNumberRule;
import com.rhn.platform.numbering.api.BusinessNumberScope;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.file.Path;
import java.nio.file.Files;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ConfiguredBusinessNumberGeneratorTest {
    @TempDir Path temporary;
    private static final BusinessNumberContext OWNER = new BusinessNumberContext(1L, 2L, 3L);
    private static final Clock DAY = Clock.fixed(Instant.parse("2026-10-10T16:00:00Z"), ZoneOffset.UTC);

    @Test
    void application_import_and_external_file_override_merge_one_rule_without_losing_the_catalog() throws Exception {
        Path override = temporary.resolve("numbering-override.yml");
        Files.writeString(override, """
                rhn:
                  business-numbering:
                    rules:
                      outpatient-encounter:
                        suffix: -B
                        date-format: yyyyMMdd
                        scope: DEPARTMENT
                """);
        new ApplicationContextRunner().withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(BusinessNumberingConfiguration.class)
                .withPropertyValues("spring.config.additional-location=" + override.toUri(), "spring.profiles.active=test")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    var configuration = context.getBean(BusinessNumberingProperties.class);
                    assertThat(configuration.rules()).hasSize(45);
                    var rule = configuration.rules().get("outpatient-encounter");
                    assertThat(rule.scope()).isEqualTo(BusinessNumberScope.DEPARTMENT);
                    assertThat(rule.format(LocalDate.of(2026, 10, 11), 1)).isEqualTo("OP2026101100001-B");
                    assertThat(configuration.rules().get("invoice").prefix()).isEqualTo("INV");
                });
    }

    @Test
    void shipped_file_binds_all_rules_and_the_requested_example_without_database_configuration() throws Exception {
        var environment = new StandardEnvironment();
        new YamlPropertySourceLoader().load("numbering", new ClassPathResource("business-numbering.yml"))
                .forEach(source -> environment.getPropertySources().addLast(source));
        var properties = Binder.get(environment).bind("rhn.business-numbering", Bindable.of(BusinessNumberingProperties.class)).get();
        assertThat(properties.rules()).hasSize(45).containsKeys("outpatient-encounter", "invoice", "stock-purchase-order", "schedule", "pharmacy-return");
        assertThat(properties.rules().get("inpatient-episode").prefix()).isEqualTo("IP");
        assertThat(properties.rules().get("inpatient-encounter").prefix()).isEqualTo("IPE");
        var counter = mock(BusinessNumberCounter.class);
        when(counter.next(anyString(), anyLong())).thenReturn(1L);
        var generator = generator(properties, counter, DAY);
        assertThat(generator.next("outpatient-encounter")).isEqualTo("OP26101100001");
        assertThat(generator.preview("pharmacy-return", LocalDate.of(2026, 10, 11), 1)).isEqualTo("RET-26101100001");
        verify(counter).next("rhn:business-number:outpatient-encounter:tenant:1:20261011", 99999L);
        assertThat(generator.rules().get("invoice").dateFormat()).isEqualTo("yyMMdd");
        assertThatThrownBy(() -> generator.rules().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void preview_accepts_short_and_long_dates_and_prefix_suffix_without_consuming_a_sequence() {
        var counter = mock(BusinessNumberCounter.class);
        var generator = generator(properties(new BusinessNumberRule("OP-", "-A", "yyyymmdd", 5, null)), counter, DAY);
        assertThat(generator.preview("visit", LocalDate.of(2026, 10, 11), 1)).isEqualTo("OP-2026101100001-A");
        assertThat(new BusinessNumberRule("OP", null, "yymmdd", null, null).format(LocalDate.of(2026, 10, 11), 1))
                .isEqualTo("OP26101100001");
        verifyNoInteractions(counter);
    }

    @ParameterizedTest
    @EnumSource(BusinessNumberScope.class)
    void allocation_is_isolated_by_the_selected_level_and_reuses_the_same_counter_for_same_owner(BusinessNumberScope scope) {
        Map<String, AtomicLong> values = new ConcurrentHashMap<>();
        BusinessNumberCounter counter = new BusinessNumberCounter() {
            public long next(String key, long maximum) { return values.computeIfAbsent(key, ignored -> new AtomicLong()).incrementAndGet(); }
            public long current(String key) { return values.getOrDefault(key, new AtomicLong()).get(); }
        };
        var generator = generator(properties(new BusinessNumberRule("OP", null, null, null, scope)), counter, DAY);
        assertThat(generator.next("visit", OWNER)).endsWith("00001");
        // Department changes split only a department-level counter.
        assertThat(generator.next("visit", new BusinessNumberContext(1L, 2L, 4L)))
                .endsWith(scope == BusinessNumberScope.DEPARTMENT ? "00001" : "00002");
        // Organization changes split organization and department counters, with all parent IDs included.
        assertThat(generator.next("visit", new BusinessNumberContext(1L, 5L, 3L)))
                .endsWith(scope == BusinessNumberScope.ORGANIZATION || scope == BusinessNumberScope.DEPARTMENT ? "00001" : "00003");
        assertThat(generator.next("visit", new BusinessNumberContext(6L, 2L, 3L)))
                .endsWith(scope == BusinessNumberScope.SYSTEM ? "00004" : "00001");
        assertThat(generator.next("visit", OWNER)).endsWith(switch (scope) {
            case SYSTEM -> "00005"; case TENANT -> "00004"; case ORGANIZATION -> "00003"; case DEPARTMENT -> "00002";
        });
    }

    @Test
    void midnight_uses_business_timezone_and_next_day_starts_a_new_counter_while_clock_rollback_reuses_old_counter() {
        Map<String, AtomicLong> values = new ConcurrentHashMap<>();
        BusinessNumberCounter counter = new BusinessNumberCounter() {
            public long next(String key, long maximum) { return values.computeIfAbsent(key, ignored -> new AtomicLong()).incrementAndGet(); }
            public long current(String key) { return values.getOrDefault(key, new AtomicLong()).get(); }
        };
        var properties = properties(new BusinessNumberRule("OP", null, null, null, null));
        var before = generator(properties, counter, Clock.fixed(Instant.parse("2026-10-10T15:59:59Z"), ZoneOffset.UTC));
        var after = generator(properties, counter, DAY);
        assertThat(before.next("visit", OWNER)).isEqualTo("OP26101000001");
        assertThat(after.next("visit", OWNER)).isEqualTo("OP26101100001");
        assertThat(before.next("visit", OWNER)).isEqualTo("OP26101000002");
        // Changing display length/prefix leaves allocation identity stable.
        var changed = generator(properties(new BusinessNumberRule("NEW", "-X", "yyyyMMdd", 5, null)), counter, DAY);
        assertThat(changed.next("visit", OWNER)).isEqualTo("NEW2026101100002-X");
    }

    @Test
    void invalid_context_or_unknown_rules_fail_before_consuming_numbers_and_system_scope_can_run_without_tenant() {
        var counter = mock(BusinessNumberCounter.class);
        var generator = generator(properties(new BusinessNumberRule("OP", null, null, null, BusinessNumberScope.DEPARTMENT)), counter, DAY);
        assertThatThrownBy(() -> generator.next("visit", new BusinessNumberContext(1L, 2L, null)))
                .isInstanceOf(BusinessException.class).extracting("code").isEqualTo("BUSINESS_NUMBER_CONTEXT_INVALID");
        assertThatThrownBy(() -> generator.next("unknown", OWNER)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(counter);
        when(counter.next(anyString(), anyLong())).thenReturn(1L);
        assertThat(generator(properties(new BusinessNumberRule("OP", null, null, null, BusinessNumberScope.SYSTEM)), counter, DAY)
                .next("visit", null)).isEqualTo("OP26101100001");
    }

    @Test
    void exhausted_or_unavailable_sequences_never_return_random_or_wrapped_numbers() {
        var counter = mock(BusinessNumberCounter.class);
        var generator = generator(properties(new BusinessNumberRule("OP", null, null, null, null)), counter, DAY);
        when(counter.next(anyString(), anyLong())).thenReturn(-1L);
        assertThatThrownBy(() -> generator.next("visit", OWNER)).isInstanceOf(BusinessException.class)
                .extracting("code").isEqualTo("BUSINESS_NUMBER_EXHAUSTED");
        when(counter.next(anyString(), anyLong())).thenThrow(new IllegalStateException("Redis unavailable"));
        assertThatThrownBy(() -> generator.next("visit", OWNER)).isInstanceOf(BusinessException.class)
                .extracting("code").isEqualTo("BUSINESS_NUMBER_UNAVAILABLE");
    }

    @Test
    void malformed_configuration_is_rejected_and_sequence_is_never_truncated() {
        assertThatThrownBy(() -> new BusinessNumberRule("OP", null, "yyyyMMddHHmmss", null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BusinessNumberRule("OP", null, null, 13, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BusinessNumberRule("OP\n", null, null, null, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BusinessNumberingProperties("bad{key}", null, Map.of("visit", new BusinessNumberRule("OP", null, null, null, null))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BusinessNumberingProperties(null, "bad-zone", Map.of("visit", new BusinessNumberRule("OP", null, null, null, null))))
                .isInstanceOf(java.time.DateTimeException.class);
        assertThatThrownBy(() -> new BusinessNumberRule("OP", null, null, 2, null).format(LocalDate.of(2026, 10, 11), 100))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static BusinessNumberingProperties properties(BusinessNumberRule rule) {
        return new BusinessNumberingProperties(null, null, Map.of("visit", rule));
    }

    @Test
    void inspection_does_not_allocate_and_reports_capacity_timezone_and_unavailability() {
        var counter = mock(BusinessNumberCounter.class);
        var generator = generator(properties(new BusinessNumberRule("OP", null, null, 2, null)), counter, DAY);
        when(counter.current(anyString())).thenReturn(0L, 98L, 99L);
        var first = generator.inspect("visit", OWNER);
        assertThat(first.businessDate()).isEqualTo(LocalDate.of(2026, 10, 11));
        assertThat(first.zoneId()).isEqualTo("Asia/Shanghai");
        assertThat(first.scopeKey()).isEqualTo("tenant:1");
        assertThat(first.nextNumber()).isEqualTo("OP26101101");
        assertThat(generator.inspect("visit", OWNER).nextSequence()).isEqualTo(99L);
        var exhausted = generator.inspect("visit", OWNER);
        assertThat(exhausted.nextSequence()).isNull();
        assertThat(exhausted.nextNumber()).isNull();
        verify(counter, never()).next(anyString(), anyLong());
        when(counter.current(anyString())).thenThrow(new IllegalStateException("Redis unavailable"));
        assertThatThrownBy(() -> generator.inspect("visit", OWNER)).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.code()).isEqualTo("BUSINESS_NUMBER_UNAVAILABLE"));
    }

    @Test
    void outpatient_startup_rejects_scopes_that_can_collide_within_a_tenant() throws Exception {
        var environment = new StandardEnvironment();
        new YamlPropertySourceLoader().load("numbering", new ClassPathResource("business-numbering.yml"))
                .forEach(source -> environment.getPropertySources().addLast(source));
        var properties = Binder.get(environment).bind("rhn.business-numbering", Bindable.of(BusinessNumberingProperties.class)).get();
        var numbers = mock(com.rhn.platform.numbering.api.BusinessNumberGenerator.class);
        var rules = new java.util.HashMap<>(properties.rules());
        when(numbers.rules()).thenReturn(rules);
        com.rhn.outpatient.OutpatientBusinessNumberingPolicy.validate(numbers);
        rules.put("outpatient-encounter", new BusinessNumberRule("OP", null, null, null, BusinessNumberScope.DEPARTMENT));
        assertThatThrownBy(() -> com.rhn.outpatient.OutpatientBusinessNumberingPolicy.validate(numbers))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("outpatient-encounter");
    }

    private static ConfiguredBusinessNumberGenerator generator(BusinessNumberingProperties properties, BusinessNumberCounter counter, Clock clock) {
        return new ConfiguredBusinessNumberGenerator(properties, counter,
                () -> new ExecutionContext(1L, 10L, "doctor", "test", java.util.Set.of(), 2L, 3L, "DEPARTMENT", java.util.Set.of(), java.util.Set.of()), clock);
    }
}
