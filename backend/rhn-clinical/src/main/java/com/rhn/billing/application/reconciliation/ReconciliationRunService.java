package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.ReconciliationAdapterRegistry;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.platform.numbering.api.*;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.rhn.shared.api.BusinessErrors.*;

/** Publishes an immutable execution against one serializable local snapshot; no financial writes. */
@Service
public class ReconciliationRunService {
 private final ReconciliationAttemptRepository attempts;private final ReconciliationTaskRepository tasks;private final ReconciliationStatementFileRepository files;private final ReconciliationStatementRowRepository rows;
 private final ReconciliationBatchRepository batches;private final ReconciliationItemRepository items;private final ReconciliationItemEventRepository events;
 private final PaymentOrderRepository orders;private final PaymentRepository payments;private final LedgerEntryRepository ledger;
 private final ReconciliationAdapterRegistry adapters;private final SecretEncryptionService encryption;private final JsonCodec json;private final BusinessNumberGenerator numbers;
 public ReconciliationRunService(ReconciliationAttemptRepository attempts,ReconciliationTaskRepository tasks,ReconciliationStatementFileRepository files,ReconciliationStatementRowRepository rows,ReconciliationBatchRepository batches,ReconciliationItemRepository items,ReconciliationItemEventRepository events,PaymentOrderRepository orders,PaymentRepository payments,LedgerEntryRepository ledger,ReconciliationAdapterRegistry adapters,SecretEncryptionService encryption,JsonCodec json,BusinessNumberGenerator numbers){this.attempts=attempts;this.tasks=tasks;this.files=files;this.rows=rows;this.batches=batches;this.items=items;this.events=events;this.orders=orders;this.payments=payments;this.ledger=ledger;this.adapters=adapters;this.encryption=encryption;this.json=json;this.numbers=numbers;}
 @Transactional
 public Long stage(Long taskId,long token,StatementDownload download){
  var task=tasks.lock(taskId).orElseThrow();if(!task.owns(token))return null;
  if(!encryption.available())throw conflict("RECON_ENCRYPTION_REQUIRED","服务器未提供账单证据加密能力");
  var manifest=new TreeMap<String,String>();for(var part:download.files())manifest.put(part.name(),Base64.getEncoder().encodeToString(part.content()));
  if(download.transportFile()!=null)manifest.put("__original__/"+download.transportFile().name(),Base64.getEncoder().encodeToString(download.transportFile().content()));
  String text=json.write(manifest),sha=ReconciliationFingerprints.hash(text+"|"+download.proof());
  var file=new ReconciliationStatementFile(task.tenantId(),task.id(),task.attempt(),sha,adapters.require(task.paymentMethodCode()).statementCapability().parserVersion(),"NOT_CAPTURED",download.proof());
  file.setEncryptedFiles(encryption.encrypt(text,binding(task.tenantId(),file.id())));files.saveAndFlush(file);
  attempts.findByTenantIdAndTaskIdAndClaimToken(task.tenantId(),task.id(),token).ifPresent(a->a.evidence(file.id()));
  return file.id();
 }
 @Transactional(isolation=Isolation.SERIALIZABLE)
 public void apply(Long taskId,long claimToken,StatementRequest request,StatementDownload download,ParsedStatement parsed){
  var task=tasks.lock(taskId).orElseThrow();if(!task.owns(claimToken))return;
  if(!encryption.available())throw conflict("RECON_ENCRYPTION_REQUIRED","服务器未提供账单证据加密能力");
  validate(request,parsed);
  Instant snapshotAt=Instant.now();var adapter=adapters.require(task.paymentMethodCode());var zone=ZoneId.of(adapter.statementCapability().zoneId());
  if(!adapter.merchantScope(task.tenantId(),task.credentialOrganizationId()).fingerprint().equals(task.merchantScope()))throw conflict("RECON_MERCHANT_CHANGED","商户身份已变化，不能发布对账结果");
  var scopeCache=new HashMap<Long,MerchantScope>();
  Function<Long,MerchantScope> scopeFor=org->scopeCache.computeIfAbsent(org,key->{try{return adapter.merchantScope(task.tenantId(),key);}catch(RuntimeException e){return null;}});
  Instant start=task.businessDate().atStartOfDay(zone).toInstant(),end=task.businessDate().plusDays(1).atStartOfDay(zone).toInstant();
  var localDay=payments.findByTenantIdAndPaymentMethodCodeAndCurrencyCodeAndPaidAtGreaterThanEqualAndPaidAtLessThan(task.tenantId(),task.paymentMethodCode(),task.currencyCode(),start,end).stream()
    .filter(p->{var scope=scopeFor.apply(p.organizationId());return scope!=null&&scope.fingerprint().equals(task.merchantScope());}).toList();
  var knownDates=new HashMap<Long,Set<LocalDate>>();for(var chunk:chunks(localDay.stream().map(Payment::id).toList()))items.matchedDates(task.tenantId(),chunk).forEach(v->knownDates.computeIfAbsent(v.getPaymentId(),key->new HashSet<>()).add(v.getBusinessDate()));
  localDay=localDay.stream().filter(p->knownDates.getOrDefault(p.id(),Set.of(task.businessDate())).contains(task.businessDate())).toList();
  var ids=new LinkedHashSet<Long>();for(var row:parsed.rows()){Long id=ReconciliationMatcher.orderId(row);if(id!=null)ids.add(id);}for(var p:localDay)if(p.paymentOrderId()!=null)ids.add(p.paymentOrderId());
  var orderMap=new HashMap<Long,PaymentOrder>();for(var chunk:chunks(ids))orders.findByTenantIdAndIdIn(task.tenantId(),chunk).forEach(o->orderMap.put(o.id(),o));
  var byOrder=new HashMap<Long,List<Payment>>();for(var chunk:chunks(ids))payments.findByTenantIdAndPaymentOrderIdIn(task.tenantId(),chunk).forEach(p->byOrder.computeIfAbsent(p.paymentOrderId(),key->new ArrayList<>()).add(p));
  for(var chunk:chunks(byOrder.values().stream().flatMap(Collection::stream).map(Payment::id).toList()))items.matchedDates(task.tenantId(),chunk).forEach(v->knownDates.computeIfAbsent(v.getPaymentId(),key->new HashSet<>()).add(v.getBusinessDate()));
  var allFacts=new LinkedHashMap<Long,Payment>();localDay.forEach(p->allFacts.put(p.id(),p));byOrder.values().forEach(ps->ps.forEach(p->allFacts.put(p.id(),p)));
  var originalIds=orderMap.values().stream().map(PaymentOrder::originalPaymentId).filter(Objects::nonNull).distinct().toList();
  for(var chunk:chunks(originalIds))payments.findByTenantIdAndIdIn(task.tenantId(),chunk).stream().forEach(p->allFacts.put(p.id(),p));
  var byPayment=new HashMap<Long,List<LedgerEntry>>();for(var chunk:chunks(allFacts.keySet()))ledger.findByTenantIdAndPaymentIdIn(task.tenantId(),chunk).forEach(e->byPayment.computeIfAbsent(e.paymentId(),key->new ArrayList<>()).add(e));
  var localSignature=new ArrayList<String>();allFacts.values().forEach(p->localSignature.add("P|"+p.id()+"|"+p.organizationId()+"|"+p.paymentOrderId()+"|"+p.paymentType()+"|"+p.amount()+"|"+p.currencyCode()+"|"+p.externalTransactionNo()+"|"+p.paidAt()+"|"+p.status()+"|"+p.patientAccountId()+"|"+p.invoiceId()+"|"+p.paymentMethodCode()));
  orderMap.values().forEach(o->localSignature.add("O|"+o.id()+"|"+o.revision()+"|"+o.status()+"|"+o.organizationId()+"|"+o.requestedAmount()));
  byPayment.values().forEach(ls->ls.forEach(e->localSignature.add("L|"+e.id()+"|"+e.paymentId()+"|"+e.amount()+"|"+e.direction()+"|"+e.currencyCode()+"|"+e.entryType()+"|"+e.patientAccountId())));knownDates.forEach((paymentId,dates)->dates.stream().filter(date->!date.equals(task.businessDate())).forEach(date->localSignature.add("D|"+paymentId+"|"+date)));
  orderMap.values().forEach(order->scopeFor.apply(order.organizationId()));
  scopeCache.forEach((org,scope)->localSignature.add("S|"+org+"|"+(scope==null?"UNAVAILABLE":scope.fingerprint()+"|"+scope.appId())));Collections.sort(localSignature);
  String localHash=ReconciliationFingerprints.hash(String.join("\n",localSignature));
  var file=files.findByTenantIdAndTaskIdAndAttempt(task.tenantId(),task.id(),task.attempt()).orElseThrow();
  if(file.isComplete())throw conflict("RECON_FILE_ALREADY_PUBLISHED","此账单证据版本已经发布");
  String sha=file.sha256();
  var previous=task.latestFileId()==null?null:files.findByIdAndTenantId(task.latestFileId(),task.tenantId()).orElse(null);
  if(previous!=null&&previous.sha256().equals(sha)&&previous.localSnapshotHash().equals(localHash)&&previous.parserVersion().equals(parsed.parserVersion())&&previous.ruleVersion().equals(file.ruleVersion())){task.finished(previous.id());attempts.findByTenantIdAndTaskIdAndClaimToken(task.tenantId(),task.id(),claimToken).ifPresent(a->a.finish("NO_CHANGE",previous.id(),null,null));return;}
  file.snapshot(localHash);
  Map<String,Long> duplicateCounts=parsed.rows().stream().collect(Collectors.groupingBy(ReconciliationMatcher::key,Collectors.counting()));
  Map<String,Long> channelDuplicates=parsed.rows().stream().collect(Collectors.groupingBy(ReconciliationMatcher::channelKey,Collectors.counting()));
  var groups=new LinkedHashMap<Long,Group>();groups.put(task.credentialOrganizationId(),new Group());localDay.forEach(p->groups.computeIfAbsent(p.organizationId(),key->new Group()).facts.put(p.id(),p));
  var consumed=new HashSet<Long>();
  for(var row:parsed.rows()){
   Long orderId=ReconciliationMatcher.orderId(row);var order=orderId==null?null:orderMap.get(orderId);
   var scope=order==null?null:scopeFor.apply(order.organizationId());
   boolean owned=order!=null&&scope!=null&&scope.fingerprint().equals(task.merchantScope())&&order.paymentMethodCode().equals(task.paymentMethodCode());
   var factList=owned&&!"REVERSAL".equals(row.transactionType())?byOrder.getOrDefault(order.id(),List.of()):List.<Payment>of();
   var stored=rows.save(new ReconciliationStatementRow(task.tenantId(),file.id(),row,owned?order.organizationId():null,owned?order.id():null));
   if(!owned)continue;
   boolean identity=order.currencyCode().equals(row.currencyCode())&&scope.merchantId().equals(row.merchantId())
      &&(row.appId()==null||row.appId().isBlank()||scope.appId().equals(row.appId()))
      &&(!"REFUND".equals(row.transactionType())?"SETTLEMENT_PAY".equals(order.orderType()):"REFUND".equals(order.orderType()));
   if("REFUND".equals(row.transactionType())){
    var original=order.originalPaymentId()==null?null:payments.findByIdAndTenantId(order.originalPaymentId(),task.tenantId()).orElse(null);
    identity&=original!=null&&original.organizationId().equals(order.organizationId())&&Objects.equals(original.externalTransactionNo(),row.originalExternalTransactionNo())
       &&Objects.equals(original.paymentMethodCode(),order.paymentMethodCode())&&Objects.equals(original.currencyCode(),order.currencyCode())
       &&Objects.equals(original.patientAccountId(),order.patientAccountId())&&Objects.equals(row.merchantOrderNo(),"P"+original.paymentOrderId());
   }
   Payment single=factList.size()==1?factList.getFirst():null;
   var match=ReconciliationMatcher.match(row,order,factList,single==null?List.of():byPayment.getOrDefault(single.id(),List.of()),identity,duplicateCounts.get(ReconciliationMatcher.key(row))>1||channelDuplicates.get(ReconciliationMatcher.channelKey(row))>1||single!=null&&knownDates.getOrDefault(single.id(),Set.of(task.businessDate())).stream().anyMatch(d->!d.equals(task.businessDate())),zone);
   var group=groups.computeIfAbsent(order.organizationId(),key->new Group());group.lines.add(new Line(stored,row,order,match));
   factList.forEach(p->{consumed.add(p.id());group.facts.put(p.id(),p);});
   if(row.transactionType().equals("PAYMENT"))group.externalPayments=group.externalPayments.add(row.amount());
   else{group.acceptedRefunds=group.acceptedRefunds.add(row.amount());if(row.finalSuccess())group.finalRefunds=group.finalRefunds.add(row.amount());}
   group.fees=group.fees.add(row.fee());
  }
  for(var entry:groups.entrySet()){
   Long org=entry.getKey();Group g=entry.getValue();var pendingBatch=new ReconciliationBatch(task.tenantId(),org,numbers.next("reconciliation-batch",new BusinessNumberContext(task.tenantId(),org,null)),"AUTO-"+file.id()+"-"+org,"PAYMENT_CHANNEL",task.adapterCode(),task.paymentMethodCode(),task.businessDate(),task.currencyCode(),task.createdBy());
   pendingBatch.bindStatement(task.id(),file.id(),task.attempt(),task.merchantScope(),snapshotAt,localHash);var batch=batches.saveAndFlush(pendingBatch);int differences=0;
   for(var line:g.lines){var match=line.match();if(!match.matched())differences++;
    var item=new ReconciliationItem(task.tenantId(),batch.id(),match.payment()==null?null:match.payment().id(),line.row.externalTransactionNo(),match.type(),match.localAmount(),match.externalAmount(),task.currencyCode());
    item.evidence(line.stored.id(),line.order.id(),line.row.transactionType(),line.row.channelStatus(),line.row.occurredAt(),match.payment()==null?null:match.payment().paidAt());save(item,task.createdBy());
   }
   for(var p:g.facts.values())if(!consumed.contains(p.id())){differences++;var item=new ReconciliationItem(task.tenantId(),batch.id(),p.id(),p.externalTransactionNo(),"LOCAL_ONLY",ReconciliationMatcher.signed(p),BigDecimal.ZERO.setScale(6),task.currencyCode());item.evidence(null,p.paymentOrderId(),p.paymentType(),null,null,p.paidAt());save(item,task.createdBy());}
   var localNet=g.facts.values().stream().map(ReconciliationMatcher::signed).reduce(BigDecimal.ZERO.setScale(6),BigDecimal::add);
   batch.totals(g.externalPayments,g.acceptedRefunds,g.finalRefunds,g.fees);batch.complete("FILE-"+file.id(),g.facts.size(),g.lines.size(),differences,localNet,g.externalPayments.subtract(g.finalRefunds),task.createdBy());
  }
  if(!task.owns(claimToken))throw conflict("RECON_LEASE_EXPIRED","对账执行租约已过期，本版结果未发布");
  file.complete();task.finished(file.id());attempts.findByTenantIdAndTaskIdAndClaimToken(task.tenantId(),task.id(),claimToken).ifPresent(a->a.finish("COMPLETED",file.id(),null,null));
 }
 private void validate(StatementRequest request,ParsedStatement parsed){
  if(parsed==null||parsed.summary()==null||parsed.rows().size()>100000||parsed.summary().count()!=parsed.rows().size())throw conflict("RECON_STATEMENT_INVALID","账单规范明细与汇总不完整");
  var lineNumbers=new HashSet<Integer>();var capability=adapters.require(tasks.findById(request.taskId()).orElseThrow().paymentMethodCode()).statementCapability();
  if(!capability.parserVersion().equals(parsed.parserVersion()))throw conflict("RECON_PARSER_VERSION_INVALID","账单解析版本与声明不一致");
  for(var row:parsed.rows()){
   if(!lineNumbers.add(row.lineNumber())||row.lineNumber()<1||!Set.of("PAYMENT","REFUND","REVERSAL").contains(row.transactionType())||row.amount()==null||row.amount().signum()<=0||row.amount().stripTrailingZeros().scale()>2||row.fee()==null||row.settlementAmount()==null||row.settlementAmount().signum()<0||row.settlementAmount().stripTrailingZeros().scale()>2||row.fee().stripTrailingZeros().scale()>2||row.outcome()==null||!request.currencyCode().equals(row.currencyCode())||!request.scope().merchantId().equals(row.merchantId())||row.occurredAt()==null||!row.occurredAt().atZone(ZoneId.of(capability.zoneId())).toLocalDate().equals(request.businessDate()))
    throw conflict("RECON_STATEMENT_INVALID","账单明细身份、日期、金额精度或状态校验未通过");
  }
  var zero=BigDecimal.ZERO.setScale(6);var ps=zero;var rs=zero;var sp=zero;var sr=zero;var fees=zero;
  for(var row:parsed.rows()){if("PAYMENT".equals(row.transactionType())){ps=ps.add(row.amount());sp=sp.add(row.settlementAmount());}else{rs=rs.add(row.amount());sr=sr.add(row.settlementAmount());}fees=fees.add(row.fee());}
  var summary=parsed.summary();if(summary.payments()==null||summary.refunds()==null||summary.settlementPayments()==null||summary.settlementRefunds()==null||summary.fees()==null||ps.compareTo(summary.payments())!=0||rs.compareTo(summary.refunds())!=0||sp.compareTo(summary.settlementPayments())!=0||sr.compareTo(summary.settlementRefunds())!=0||fees.compareTo(summary.fees())!=0)throw conflict("RECON_STATEMENT_INVALID","账单规范金额汇总与逐笔明细不一致");
 }
 private void save(ReconciliationItem item,Long actor){items.save(item);events.save(new ReconciliationItemEvent(item.tenantId(),item.id(),"DETECT",null,item.status(),"DETECT-"+item.id(),actor,item.matchType()));}
 public static String binding(Long tenant,Long file){return "payment-statement:"+tenant+"/"+file;}
 private static List<List<Long>> chunks(Collection<Long> ids){var values=new ArrayList<>(ids);var chunks=new ArrayList<List<Long>>();for(int i=0;i<values.size();i+=500)chunks.add(values.subList(i,Math.min(values.size(),i+500)));return chunks;}
 private record Line(ReconciliationStatementRow stored,StatementRow row,PaymentOrder order,ReconciliationMatcher.Match match){}
 private static class Group {
  final Map<Long,Payment> facts=new LinkedHashMap<>();final List<Line> lines=new ArrayList<>();
  BigDecimal externalPayments=BigDecimal.ZERO.setScale(6),acceptedRefunds=BigDecimal.ZERO.setScale(6),finalRefunds=BigDecimal.ZERO.setScale(6),fees=BigDecimal.ZERO.setScale(6);
 }
}
