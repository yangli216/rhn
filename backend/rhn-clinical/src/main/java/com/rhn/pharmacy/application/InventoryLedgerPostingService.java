package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionLineView;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveDocumentCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveCommand;

/** Public contract for immutable ledger reads and operations that change on-hand inventory. */
public interface InventoryLedgerPostingService {
    /** The caller authorizes the source business document; reads remain scoped to the current tenant. */
    java.util.List<InventoryTransactionLineView> transactionLines(Long transactionId);
    InventoryTransactionView receiveDocument(String sourceType, ReceiveCommand input);
    InventoryTransactionView receiveDocument(String sourceType, ReceiveDocumentCommand input);
    InventoryTransactionView postDocument(DocumentPostingCommand input);
}
