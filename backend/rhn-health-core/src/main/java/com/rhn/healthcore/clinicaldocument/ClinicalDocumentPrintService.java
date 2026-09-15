package com.rhn.healthcore.clinicaldocument;

import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintSourceRef;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.printing.api.StandardPrintCommand;
import org.springframework.stereotype.Service;

@Service
class ClinicalDocumentPrintService {
    private final PrintingService printingService;

    ClinicalDocumentPrintService(PrintingService printingService) {
        this.printingService = printingService;
    }

    PrintReceipt print(Long documentId, PrintAction action) {
        return printingService.submit(new StandardPrintCommand(PrintTaskCodes.OUTPATIENT_MEDICAL_RECORD,
                new PrintSourceRef("ClinicalDocument", documentId, null), action.purpose(), action.copies(), null));
    }

    record PrintAction(String purpose, int copies) {}
}
