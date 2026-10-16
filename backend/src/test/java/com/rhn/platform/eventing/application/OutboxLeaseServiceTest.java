package com.rhn.platform.eventing.application;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import com.rhn.platform.eventing.domain.OutboxEvent;
import com.rhn.platform.eventing.infrastructure.OutboxEventRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OutboxLeaseServiceTest {
    private final OutboxEventRepository repository = mock(OutboxEventRepository.class);
    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withInitializer(context -> context.getBeanFactory()
                    .setConversionService(ApplicationConversionService.getSharedInstance()))
            .withBean(OutboxEventRepository.class, () -> repository)
            .withUserConfiguration(OutboxLeaseService.class);

    @Test
    void defaultLeaseRemainsThirtySecondsWithoutExternalConfiguration() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertClaimedUntil(context.getBean(OutboxLeaseService.class), Duration.ofSeconds(30));
        });
    }

    @Test
    void shippedConfigurationKeepsTheExistingLeaseByDefault() {
        runner.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertClaimedUntil(context.getBean(OutboxLeaseService.class), Duration.ofSeconds(30));
        });
    }

    @Test
    void environmentOverrideControlsTheExpirationOfEveryClaimedEvent() {
        runner.withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("RHN_OUTBOX_LEASE_TTL=PT2M")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertClaimedUntil(context.getBean(OutboxLeaseService.class), Duration.ofMinutes(2));
                });
    }

    @Test
    void springPropertyOverrideSupportsSubsecondLeases() {
        runner.withPropertyValues("rhn.eventing.outbox.lease-ttl=PT0.5S").run(context -> {
            assertThat(context).hasNotFailed();
            assertClaimedUntil(context.getBean(OutboxLeaseService.class), Duration.ofMillis(500));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {"PT0S", "-PT1S", "not-a-duration"})
    void invalidLeaseConfigurationPreventsStartup(String value) {
        runner.withPropertyValues("rhn.eventing.outbox.lease-ttl=" + value).run(context ->
                assertThat(context).hasFailed().getFailure()
                        .hasRootCauseInstanceOf(IllegalArgumentException.class));
    }

    @Test
    void defaultBatchSizeRemainsFiftyWithoutExternalConfiguration() {
        runner.run(context -> {
            assertThat(context).hasNotFailed();
            assertBatchSize(context.getBean(OutboxLeaseService.class), 50);
        });
    }

    @Test
    void shippedConfigurationKeepsTheExistingBatchSizeByDefault() {
        runner.withInitializer(new ConfigDataApplicationContextInitializer()).run(context -> {
            assertThat(context).hasNotFailed();
            assertBatchSize(context.getBean(OutboxLeaseService.class), 50);
        });
    }

    @Test
    void environmentOverrideControlsTheBatchSize() {
        runner.withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("RHN_OUTBOX_BATCH_SIZE=7")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertBatchSize(context.getBean(OutboxLeaseService.class), 7);
                });
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "not-an-integer"})
    void invalidBatchConfigurationPreventsStartup(String value) {
        runner.withPropertyValues("rhn.eventing.outbox.batch-size=" + value).run(context ->
                assertThat(context).hasFailed().getFailure()
                        .hasRootCauseInstanceOf(IllegalArgumentException.class));
    }

    private void assertBatchSize(OutboxLeaseService service, int expectedBatchSize) {
        when(repository.lockDispatchable(any(Instant.class), any(Pageable.class))).thenReturn(List.of());

        assertThat(service.claim("worker-a")).isEmpty();

        var pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).lockDispatchable(any(Instant.class), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(expectedBatchSize);
    }

    private void assertClaimedUntil(OutboxLeaseService service, Duration expectedLease) {
        var first = event(11L);
        var second = event(12L);
        when(repository.lockDispatchable(any(Instant.class), any(Pageable.class)))
                .thenReturn(List.of(first, second));

        assertThat(service.claim("worker-a")).containsExactly(11L, 12L);

        var claimedAt = ArgumentCaptor.forClass(Instant.class);
        verify(repository).lockDispatchable(claimedAt.capture(), any(Pageable.class));
        for (var event : List.of(first, second)) {
            assertThat(event.claimedBy()).isEqualTo("worker-a");
            assertThat(event.publicationStatus()).isEqualTo("PENDING");
            assertThat(ReflectionTestUtils.getField(event, "claimedUntil"))
                    .isEqualTo(claimedAt.getValue().plus(expectedLease));
        }
    }

    private OutboxEvent event(Long id) {
        Instant now = Instant.now();
        return new OutboxEvent(new DomainEventEnvelope(id, 1L, 2L, "TEST", 1, "Resident", 3L,
                0, 3L, now, now, "test", "test-suite", "lease-test", null, Map.of(), 1), "{}");
    }
}
