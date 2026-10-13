package com.rhn.platform.printing.api;

import java.util.List;

/** Public controlled-printing contract used by business modules. */
public interface PrintingService {
    PrintReceipt submit(StandardPrintCommand command);
    /** Compatibility entry point for callers that have not migrated to a standard task code. */
    @Deprecated(forRemoval = true)
    PrintReceipt generate(PrintRequest request);
    PrintReceipt reprint(Long jobId, int copies);
    PrintReceipt reprint(Long jobId, int copies, String reason, String idempotencyKey);
    java.util.List<PrintRecordView> recordsBySource(Long encounterId, String sourceType, Long sourceId);
    PrintContent output(Long outputId);
    List<PrintRecordView> recordsByEncounter(Long encounterId);
    List<PrintTemplateView> visibleTemplates();
}
