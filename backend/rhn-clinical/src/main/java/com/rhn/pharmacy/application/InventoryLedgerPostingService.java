package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionView;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveDocumentCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveCommand;

/** Public contract for every operation that changes on-hand inventory and appends ledger lines. */
public interface InventoryLedgerPostingService {
    InventoryTransactionView receiveDocument(String sourceType, ReceiveCommand input);
    InventoryTransactionView receiveDocument(String sourceType, ReceiveDocumentCommand input);
    InventoryTransactionView postDocument(DocumentPostingCommand input);
}
