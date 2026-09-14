package com.rhn.treatment.domain;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SkinTestEventTest {
    private static final Instant NOW = Instant.parse("2026-08-30T12:00:00Z");

    @Test
    void negative_result_requires_the_full_observation_period() {
        SkinTestEvent event = event(NOW, 20);

        BusinessException error = assertThrows(BusinessException.class, () -> event.complete(
                0, "NEGATIVE", null, null, null, "申请提前判读", 11L, 12L, null, null, null,
                NOW.plusSeconds(19 * 60L)));

        assertEquals("SKIN_TEST_EARLY_NEGATIVE_FORBIDDEN", error.code());
    }

    @Test
    void negative_result_is_allowed_after_the_observation_period() {
        SkinTestEvent event = event(NOW, 20);

        assertDoesNotThrow(() -> event.complete(0, "NEGATIVE", null, null,
                "观察期满未见异常", null, 11L, 12L, 13L, 14L, "张复核护士", NOW.plusSeconds(20 * 60L)));
        assertEquals("NEGATIVE", event.result());
        assertEquals("张复核护士", event.verifiedByName());
        assertEquals(14L, event.verifiedByPractitionerId());
    }

    @Test
    void explicit_positive_reaction_can_be_read_early_with_a_clinical_reason() {
        SkinTestEvent event = event(NOW, 20);

        assertDoesNotThrow(() -> event.complete(0, "POSITIVE", null, null,
                "局部风团伴明显红晕", "已出现明确阳性局部反应", 11L, 12L, 13L, 14L, "李复核护士",
                NOW.plusSeconds(5 * 60L)));
        assertEquals("POSITIVE", event.result());
        assertEquals("李复核护士", event.verifiedByName());
    }

    private SkinTestEvent event(Instant startedAt, int observationMinutes) {
        return new SkinTestEvent(1L, 2L, 3L, 4L, 5L, 6L, 7L, 1,
                "PENICILLIN", "青霉素注射剂", "INTRADERMAL", false,
                null, "标准配制皮试液", null, "LOT-001", null, null,
                "左前臂屈侧", "NAME_AND_IDENTIFIER", observationMinutes,
                11L, 12L, startedAt);
    }
}
