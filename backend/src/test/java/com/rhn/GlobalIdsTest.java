package com.rhn;

import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GlobalIdsTest {
    @Test
    void generated_ids_are_positive_unique_monotonic_signed_bigints() {
        Set<Long> values = new HashSet<>();
        long previous = 0;
        for (int index = 0; index < 10_000; index++) {
            long current = GlobalIds.next();
            assertTrue(current > previous);
            assertTrue(current > 0);
            assertTrue(Long.toString(current).length() <= 19);
            assertTrue(values.add(current));
            previous = current;
        }
    }

    @Test
    void external_form_is_a_lossless_decimal_string_and_node_ids_are_bounded() {
        long id = GlobalIds.next();
        assertEquals(id, GlobalIds.parseExternal(GlobalIds.external(id)));
        assertThrows(IllegalArgumentException.class, () -> GlobalIds.parseExternal("0"));
        assertThrows(IllegalArgumentException.class, () -> GlobalIds.parseExternal("not-an-id"));
        assertEquals(8, GlobalIds.randomSuffix(8).length());
    }
}
