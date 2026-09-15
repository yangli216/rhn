package com.rhn.diagnostics.api;

import java.util.Collection;
import java.util.Map;

/** Compact diagnostic-execution facts for outpatient-flow coordination. */
public interface DiagnosticFlowDirectory {
    Map<Long, DiagnosticFlowSnapshot> summarize(Long tenantId, Collection<Long> encounterIds);

    record DiagnosticFlowSnapshot(int totalCount, int blockedCount, int waitingCount,
                                  int inProgressCount, int exceptionCount, int completedCount) {}
}
