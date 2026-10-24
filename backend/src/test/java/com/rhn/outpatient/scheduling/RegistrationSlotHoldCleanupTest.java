package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientScheduleDirectory.SlotHoldCommand;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RegistrationSlotHoldCleanupTest {
    private static final Long TENANT = 7L;
    private static final Long ORGANIZATION = 11L;
    private static final Long DEPARTMENT = 12L;

    @Test
    void releases_expired_holds_in_one_batch_with_a_single_sequence_lookup() {
        ServiceScheduleRepository schedules = mock(ServiceScheduleRepository.class);
        ScheduleSlotPoolRepository pools = mock(ScheduleSlotPoolRepository.class);
        ScheduleSlotHoldRepository holds = mock(ScheduleSlotHoldRepository.class);
        SlotEventRepository events = mock(SlotEventRepository.class);
        ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
        RegistrationSlotHoldService service = new RegistrationSlotHoldService(
                schedules, pools, holds, events, contexts, mock(PlatformTransactionManager.class));

        Instant startAt = Instant.now().minusSeconds(3600);
        ServiceSchedule schedule = new ServiceSchedule(TENANT, 21L, 22L, 23L, 24L, ORGANIZATION, DEPARTMENT,
                null, null, 25L, ScheduleDayPart.MORNING, null, "REG-01", "普通门诊", null,
                "Asia/Shanghai", LocalDate.now(), startAt, Instant.now().plusSeconds(3600), 20, 1L, "SCH-01");
        ScheduleSlotPool pool = new ScheduleSlotPool(TENANT, schedule.id(), 10, "POOL-01");
        pool.holdOne(); pool.holdOne();
        ScheduleSlotHold firstExpired = new ScheduleSlotHold(TENANT, pool.id(), schedule.id(), 9L,
                "OLD-1", Instant.now().minusSeconds(120));
        ScheduleSlotHold secondExpired = new ScheduleSlotHold(TENANT, pool.id(), schedule.id(), 10L,
                "OLD-2", Instant.now().minusSeconds(60));

        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT, 99L, "tester", "test",
                Set.of(), ORGANIZATION, DEPARTMENT, "DEPARTMENT", Set.of(), Set.of(), null));
        when(schedules.findByIdAndTenantId(schedule.id(), TENANT)).thenReturn(Optional.of(schedule));
        when(pools.findByTenantIdAndScheduleId(TENANT, schedule.id())).thenReturn(Optional.of(pool));
        when(holds.findByTenantIdAndIdempotencyCode(TENANT, "HOLD-REQ-1")).thenReturn(Optional.empty());
        when(holds.findByTenantIdAndSlotPoolIdAndStatusAndExpiresAtBefore(eq(TENANT), eq(pool.id()),
                eq(ScheduleSlotHoldStatus.ACTIVE), any(Instant.class)))
                .thenReturn(List.of(firstExpired, secondExpired));
        when(holds.save(any(ScheduleSlotHold.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(events.findMaxSequenceNo(TENANT, pool.id()))
                .thenReturn(Optional.of(7), Optional.of(9));

        service.reserve(new SlotHoldCommand(9L, ORGANIZATION, DEPARTMENT, schedule.id(), "HOLD-REQ-1", null));

        verify(events, never()).findTopByTenantIdAndPoolIdOrderBySequenceNoDesc(any(), any());
        verify(events, times(2)).findMaxSequenceNo(TENANT, pool.id());
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SlotEvent>> batch = ArgumentCaptor.forClass(List.class);
        verify(events).saveAll(batch.capture());
        assertEquals(List.of(8, 9), batch.getValue().stream().map(SlotEvent::sequenceNo).toList());
        ArgumentCaptor<SlotEvent> held = ArgumentCaptor.forClass(SlotEvent.class);
        verify(events).save(held.capture());
        assertEquals(10, held.getValue().sequenceNo());
        assertEquals(ScheduleSlotHoldStatus.EXPIRED, firstExpired.status());
        assertEquals(ScheduleSlotHoldStatus.EXPIRED, secondExpired.status());
        assertEquals(1, pool.heldCount());
    }
}
