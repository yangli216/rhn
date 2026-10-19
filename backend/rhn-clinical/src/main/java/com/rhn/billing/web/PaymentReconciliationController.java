package com.rhn.billing.web;

import com.rhn.billing.application.reconciliation.*;
import com.rhn.billing.application.reconciliation.ReconciliationReadService.*;
import com.rhn.billing.application.reconciliation.ReconciliationPolicyService.*;
import com.rhn.billing.application.reconciliation.ReconciliationDispositionService.*;
import com.rhn.shared.api.PageResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import com.fasterxml.jackson.annotation.*;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/billing/reconciliation")
public class PaymentReconciliationController {
 private final ReconciliationPolicyService policies;private final ReconciliationTaskService tasks;private final ReconciliationReadService reads;private final ReconciliationDispositionService disposition;private final ReconciliationExportService exports;
 public PaymentReconciliationController(ReconciliationPolicyService policies,ReconciliationTaskService tasks,ReconciliationReadService reads,ReconciliationDispositionService disposition,ReconciliationExportService exports){this.policies=policies;this.tasks=tasks;this.reads=reads;this.disposition=disposition;this.exports=exports;}
 @GetMapping("/channels") List<PaymentReconciliationChannelView> catalog(){return policies.catalog();}
 @GetMapping("/policies/{method}") PaymentReconciliationPolicyView policy(@PathVariable String method){return policies.get(method);}
 @PutMapping("/policies/{method}") PaymentReconciliationPolicyView policy(@PathVariable String method,@Valid @RequestBody PaymentReconciliationPolicyUpdate in){return policies.save(method,in.expectedRevision(),in.autoEnabled(),in.fetchTime(),in.backfillDays());}
 @GetMapping("/organizations/{organizationId}/policies/{method}") PaymentReconciliationPolicyView organizationPolicy(@PathVariable Long organizationId,@PathVariable String method){return policies.getFor(organizationId,method);}
 @PutMapping("/organizations/{organizationId}/policies/{method}") PaymentReconciliationPolicyView saveOrganizationPolicy(@PathVariable Long organizationId,@PathVariable String method,@Valid @RequestBody PaymentReconciliationPolicyUpdate in){return policies.saveFor(organizationId,method,in.expectedRevision(),in.autoEnabled(),in.fetchTime(),in.backfillDays());}
 @PostMapping("/tasks") @ResponseStatus(HttpStatus.ACCEPTED) PaymentReconciliationTaskView create(@Valid @RequestBody PaymentReconciliationCreate in){var task=tasks.enqueue(in.paymentMethodCode(),in.businessDate(),in.commandCode());return reads.get(task.id());}
 @GetMapping("/tasks") PageResult<PaymentReconciliationTaskView> list(@RequestParam String paymentMethodCode,@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(required=false)String status,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size){return reads.list(paymentMethodCode,from,to,status,page,size);}
 @GetMapping("/tasks/{id}") PaymentReconciliationTaskDetail detail(@PathVariable Long id){return reads.detail(id);}
 @PostMapping("/tasks/{id}/retry") @ResponseStatus(HttpStatus.ACCEPTED) PaymentReconciliationTaskView retry(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationVersionCommand in){tasks.retry(id,in.expectedRevision(),in.commandCode());return reads.get(id);}
 @GetMapping("/batches/{id}/items") PageResult<PaymentReconciliationItemView> items(@PathVariable Long id,@RequestParam(defaultValue="true")boolean differencesOnly,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size){return reads.items(id,differencesOnly,page,size);}
 @GetMapping("/items/{id}/events") List<PaymentReconciliationEventView> events(@PathVariable Long id){return reads.events(id);}
 @PostMapping("/items/{id}/propose") @ResponseStatus(HttpStatus.NO_CONTENT) void propose(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationReasonCommand in){disposition.propose(id,in.expectedRevision(),in.commandCode(),in.reason());}
 @PostMapping("/items/{id}/review") @ResponseStatus(HttpStatus.NO_CONTENT) void review(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationReviewCommand in){disposition.review(id,in.expectedRevision(),in.commandCode(),in.reason(),in.approve());}
 @PostMapping("/items/{id}/query") PaymentReconciliationVerificationView query(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationVersionCommand in){return disposition.query(id,in.expectedRevision(),in.commandCode());}
 @PostMapping("/batches/{id}/close") @ResponseStatus(HttpStatus.NO_CONTENT) void close(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationReasonCommand in){disposition.close(id,in.expectedRevision(),in.commandCode(),in.reason());}
 @GetMapping("/tasks/{id}/unallocated") PageResult<PaymentReconciliationUnallocatedView> unallocated(@PathVariable Long id,@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="25")int size){return reads.unallocated(id,page,size);}
 @PostMapping("/unallocated/{id}/propose") @ResponseStatus(HttpStatus.NO_CONTENT) void proposeMerchant(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationReasonCommand in){disposition.merchantDisposition(id,in.expectedRevision(),in.commandCode(),in.reason(),null);}
 @PostMapping("/unallocated/{id}/review") @ResponseStatus(HttpStatus.NO_CONTENT) void reviewMerchant(@PathVariable Long id,@Valid @RequestBody PaymentReconciliationReviewCommand in){disposition.merchantDisposition(id,in.expectedRevision(),in.commandCode(),in.reason(),in.approve());}
 @GetMapping("/batches/{id}/export") ResponseEntity<byte[]> export(@PathVariable Long id){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=payment-reconciliation.csv").contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(exports.csv(id));}
 @GetMapping("/tasks/{id}/files/{fileId}/export") ResponseEntity<byte[]> evidence(@PathVariable Long id,@PathVariable Long fileId){return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=payment-statement-evidence.zip").contentType(MediaType.APPLICATION_OCTET_STREAM).body(exports.evidence(id,fileId));}
 public record PaymentReconciliationCreate(@NotBlank @Size(max=128)String paymentMethodCode,@NotNull LocalDate businessDate,@NotBlank @Size(max=128)String commandCode){}
 public record PaymentReconciliationVersionCommand(@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)long expectedRevision,@NotBlank @Size(max=128)String commandCode){}
 public record PaymentReconciliationReasonCommand(@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)long expectedRevision,@NotBlank @Size(max=128)String commandCode,@NotBlank @Size(max=2000)String reason){}
 public record PaymentReconciliationReviewCommand(@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)long expectedRevision,@NotBlank @Size(max=128)String commandCode,@NotBlank @Size(max=2000)String reason,@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)boolean approve){}
 public record PaymentReconciliationPolicyUpdate(@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)long expectedRevision,@JsonProperty(required=true) @JsonSetter(nulls=Nulls.FAIL) @Schema(requiredMode=Schema.RequiredMode.REQUIRED)boolean autoEnabled,@NotBlank @Pattern(regexp="(?:[01][0-9]|2[0-3]):[0-5][0-9]")String fetchTime,@Min(1) @Max(90)int backfillDays){}
}
