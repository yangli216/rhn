package com.rhn.platform.printing.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Consumer-owned snapshot port; providers retain clinical authorization and source ownership. */
public interface MedicationPrintSource {
    List<TaskSnapshot> worklist(String taskType, String status, String keyword);

    record TaskSnapshot(Long id, long revision, String taskNo, String status,
                        Long residentId, String residentName, String healthRecordNo, Long encounterId,
                        Long sourceGroupId, Instant createdAt, Instant startedAt, Instant completedAt,
                        String executionSite, List<ItemSnapshot> items) {
        public TaskSnapshot {
            items = List.copyOf(items);
        }
    }

    record ItemSnapshot(String itemName, BigDecimal doseValue, String doseUnit, String routeCode,
                        String frequencyCode, String frequencyName, boolean skinTestRequired,
                        boolean cancelled) {}
}
