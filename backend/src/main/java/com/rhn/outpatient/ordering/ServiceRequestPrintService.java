package com.rhn.outpatient.ordering;

import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintSourceRef;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.printing.api.StandardPrintCommand;
import org.springframework.stereotype.Service;

@Service
class ServiceRequestPrintService {
    private final ServiceRequestPrintDataProvider dataProvider;
    private final PrintingService printingService;

    ServiceRequestPrintService(ServiceRequestPrintDataProvider dataProvider, PrintingService printingService) {
        this.dataProvider = dataProvider; this.printingService = printingService;
    }

    PrintReceipt print(Long encounterId, Long requestId, String purpose, int copies) {
        String taskCode = dataProvider.taskCode(encounterId, requestId);
        return printingService.submit(new StandardPrintCommand(taskCode,
                new PrintSourceRef("ServiceRequest", requestId, encounterId), purpose, copies, null));
    }
}
