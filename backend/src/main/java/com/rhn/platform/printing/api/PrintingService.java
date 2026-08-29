package com.rhn.platform.printing.api;

import java.util.List;

/** Public controlled-printing contract used by business modules. */
public interface PrintingService {
    PrintReceipt generate(PrintRequest request);
    PrintReceipt reprint(Long jobId, int copies);
    PrintContent output(Long outputId);
    List<PrintTemplateView> visibleTemplates();
}
