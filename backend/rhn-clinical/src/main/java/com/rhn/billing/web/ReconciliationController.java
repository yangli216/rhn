package com.rhn.billing.web;

import com.rhn.billing.api.ReconciliationAdapter.ExternalTransaction;
import com.rhn.billing.api.ReconciliationAdapter.ReconciliationStatement;
import com.rhn.billing.application.ReconciliationApplicationService;
import com.rhn.billing.application.ReconciliationApplicationService.Command;
import com.rhn.billing.application.ReconciliationTransactionService.BatchView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal; import java.time.*; import java.util.*;

@RestController @RequestMapping("/api/billing")
public class ReconciliationController {
 private final ReconciliationApplicationService service;public ReconciliationController(ReconciliationApplicationService s){service=s;}
 @PostMapping("/reconciliation-batches") @ResponseStatus(HttpStatus.CREATED)
 BatchView create(@Valid @RequestBody CreateRequest r){return service.reconcile(new Command(r.commandCode(),r.reconciliationType(),r.sourceCode(),r.paymentMethodCode(),r.businessDate(),r.currencyCode()));}
 @PostMapping("/reconciliation-batches/{id}/statement")
 BatchView apply(@PathVariable Long id,@Valid @RequestBody StatementRequest r){List<ExternalTransaction> lines=r.transactions().stream().map(x->new ExternalTransaction(x.externalTransactionNo(),x.externalOrderNo(),x.transactionType(),x.status(),x.amount(),x.currencyCode(),x.occurredAt(),x.payerReferenceDigest(),x.memo())).toList();return service.apply(id,new ReconciliationStatement(r.externalBatchNo(),r.generatedAt(),lines,null));}
 @PostMapping("/reconciliation-items/{id}/resolve") BatchView resolve(@PathVariable Long id,@Valid @RequestBody ResolveRequest r){return service.resolve(id,r.commandCode(),r.reason(),r.ignore());}
 @GetMapping("/reconciliation-batches/{id}") BatchView get(@PathVariable Long id){return service.get(id);}
 @GetMapping("/reconciliation-batches") List<BatchView>list(){return service.list();}
 record CreateRequest(@NotBlank @Size(max=128)String commandCode,@NotBlank @Pattern(regexp="PAYMENT_CHANNEL")String reconciliationType,@NotBlank @Size(max=128)String sourceCode,@NotBlank @Size(max=128)String paymentMethodCode,@NotNull LocalDate businessDate,@NotBlank @Pattern(regexp="[A-Z]{3}")String currencyCode){}
 record StatementRequest(@Size(max=128)String externalBatchNo,Instant generatedAt,@NotNull @Size(max=5000)List<@Valid TransactionRequest>transactions){}
 record TransactionRequest(@NotBlank @Size(max=128)String externalTransactionNo,@Size(max=128)String externalOrderNo,@NotBlank @Pattern(regexp="PAYMENT|REFUND")String transactionType,@NotBlank @Size(max=32)String status,@NotNull @DecimalMin("0") @Digits(integer=18,fraction=6)BigDecimal amount,@NotBlank @Pattern(regexp="[A-Z]{3}")String currencyCode,Instant occurredAt,@Size(max=128)String payerReferenceDigest,@Size(max=1000)String memo){}
 record ResolveRequest(@NotBlank @Size(max=128)String commandCode,@NotBlank @Size(max=2000)String reason,boolean ignore){}
}
