package com.rhn.outpatient.ordering;

import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintSourceRef;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.printing.api.StandardPrintCommand;
import org.springframework.stereotype.Service;

@Service
class PrescriptionPrintService {
    private final PrintingService printingService;

    PrescriptionPrintService(PrintingService printingService) { this.printingService = printingService; }

    PrintReceipt print(Long encounterId, Long prescriptionId, String purpose, int copies) {
        return printingService.submit(new StandardPrintCommand(PrintTaskCodes.OUTPATIENT_WESTERN_PRESCRIPTION,
                new PrintSourceRef("Prescription", prescriptionId, encounterId), purpose, copies, null));
    }
}
