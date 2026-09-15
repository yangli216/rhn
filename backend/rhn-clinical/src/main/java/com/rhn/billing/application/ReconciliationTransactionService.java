package com.rhn.billing.application;

import com.rhn.billing.api.ReconciliationAdapter.ExternalTransaction;
import com.rhn.billing.api.ReconciliationAdapter.ReconciliationStatement;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.*; import java.time.*; import java.time.format.DateTimeFormatter; import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service public class ReconciliationTransactionService {
 private static final DateTimeFormatter NUMBER_TIME=DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC);
 private final ReconciliationBatchRepository batches; private final ReconciliationItemRepository items;
 private final ReconciliationItemEventRepository events; private final PaymentRepository payments; private final ExecutionContextProvider contexts;
 ReconciliationTransactionService(ReconciliationBatchRepository b,ReconciliationItemRepository i,ReconciliationItemEventRepository e,PaymentRepository p,ExecutionContextProvider c){batches=b;items=i;events=e;payments=p;contexts=c;}

 @Transactional PrepareResult prepare(PrepareCommand in){ExecutionContext c=context();String command=required(in.commandCode(),"RECON_COMMAND_REQUIRED","对账幂等命令不能为空");
  ReconciliationBatch old=batches.findByTenantIdAndCommandCode(c.tenantId(),command).orElse(null);if(old!=null){same(old,in);return new PrepareResult(old,true);}
  String type=upper(in.reconciliationType());if(!"PAYMENT_CHANNEL".equals(type))throw badRequest("RECON_TYPE_UNSUPPORTED","当前仅开放支付渠道逐笔对账");
  String source=upper(required(in.sourceCode(),"RECON_SOURCE_REQUIRED","对账来源不能为空"));String method=upper(required(in.paymentMethodCode(),"RECON_METHOD_REQUIRED","支付方式不能为空"));
  LocalDate date=Objects.requireNonNull(in.businessDate(),"businessDate");String currency=upper(required(in.currencyCode(),"RECON_CURRENCY_REQUIRED","币种不能为空"));
  if(batches.findByTenantIdAndOrganizationIdAndReconciliationTypeAndSourceCodeAndBusinessDateAndCurrencyCode(c.tenantId(),c.organizationId(),type,source,date,currency).isPresent())throw conflict("RECON_SCOPE_EXISTS","当前机构、来源和业务日期的对账批次已存在");
  ReconciliationBatch value=batches.save(new ReconciliationBatch(c.tenantId(),c.organizationId(),"RB"+NUMBER_TIME.format(Instant.now())+GlobalIds.randomSuffix(6),command,type,
   source,method,date,currency,c.subjectId()));return new PrepareResult(value,false);}

 @Transactional BatchView apply(Long batchId,ReconciliationStatement statement){ExecutionContext c=context();ReconciliationBatch batch=lock(batchId,c);
  if(List.of("MATCHED","DIFFERENCE","RESOLVED").contains(batch.status()))return view(batch,true);
  if(!items.findByTenantIdAndReconciliationBatchIdOrderById(c.tenantId(),batch.id()).isEmpty())throw conflict("RECON_ALREADY_APPLIED","对账批次已有明细，不能重复覆盖");
  List<ExternalTransaction> external=statement==null||statement.transactions()==null?List.of():statement.transactions();
  ZoneId zone=ZoneId.systemDefault();Instant from=batch.businessDate().atStartOfDay(zone).toInstant(),to=batch.businessDate().plusDays(1).atStartOfDay(zone).toInstant();
  List<Payment> local=payments.findForChannelReconciliation(c.tenantId(),c.organizationId(),batch.paymentMethodCode(),batch.currencyCode(),from,to);
  Map<String,List<Payment>> localBy=new LinkedHashMap<>();List<Payment> localWithoutNo=new ArrayList<>();for(Payment p:local){if(clean(p.externalTransactionNo())==null)localWithoutNo.add(p);else localBy.computeIfAbsent(clean(p.externalTransactionNo()),k->new ArrayList<>()).add(p);}
  Map<String,List<ExternalTransaction>> extBy=new LinkedHashMap<>();for(ExternalTransaction x:external){validateExternal(batch,x);extBy.computeIfAbsent(required(x.externalTransactionNo(),"RECON_EXTERNAL_TXN_REQUIRED","渠道交易号不能为空"),k->new ArrayList<>()).add(x);}
  Set<String> keys=new LinkedHashSet<>();keys.addAll(localBy.keySet());keys.addAll(extBy.keySet());int differences=0;
  for(String key:keys){List<Payment> ls=localBy.getOrDefault(key,List.of());List<ExternalTransaction> es=extBy.getOrDefault(key,List.of());BigDecimal la=sumLocal(ls),ea=sumExternal(es);
   String match;if(ls.size()>1||es.size()>1)match="DUPLICATE";else if(ls.isEmpty())match="EXTERNAL_ONLY";else if(es.isEmpty())match="LOCAL_ONLY";
   else if(!success(es.getFirst().status()))match="STATUS_DIFFERENCE";else if(la.compareTo(ea)!=0)match="AMOUNT_DIFFERENCE";else match="MATCHED";
   if(!"MATCHED".equals(match))differences++;saveItem(c,batch,ls.size()==1?ls.getFirst().id():null,key,match,la,ea);}
  for(Payment p:localWithoutNo){differences++;saveItem(c,batch,p.id(),null,"LOCAL_ONLY",signed(p),zero());}
  BigDecimal localAmount=local.stream().map(this::signed).reduce(zero(),BigDecimal::add),externalAmount=external.stream().map(this::signed).reduce(zero(),BigDecimal::add);
  batch.complete(clean(statement==null?null:statement.externalBatchNo()),local.size(),external.size(),differences,money(localAmount),money(externalAmount),c.subjectId());return view(batch,false);}

 @Transactional void fail(Long id){ExecutionContext c=context();ReconciliationBatch b=lock(id,c);if("IMPORTED".equals(b.status()))b.failed();}
 @Transactional BatchView resolve(Long itemId,ResolveCommand in){ExecutionContext c=context();ReconciliationItem item=items.lock(itemId,c.tenantId()).orElseThrow(()->notFound("RECON_ITEM_NOT_FOUND","未找到对账差异"));
  ReconciliationBatch b=lock(item.reconciliationBatchId(),c);if(!"OPEN".equals(item.status()))return view(b,true);String reason=required(in.reason(),"RECON_RESOLUTION_REQUIRED","差异处置原因不能为空");String command=required(in.commandCode(),"RECON_RESOLUTION_COMMAND_REQUIRED","差异处置命令不能为空");
  item.resolve(c.subjectId(),reason,in.ignore());events.save(new ReconciliationItemEvent(c.tenantId(),item.id(),in.ignore()?"IGNORE":"RESOLVE","OPEN",item.status(),command,c.subjectId(),reason));
  if(items.countByTenantIdAndReconciliationBatchIdAndStatus(c.tenantId(),b.id(),"OPEN")==0)b.resolved(c.subjectId());return view(b,false);}
 @Transactional(readOnly=true) BatchView get(Long id){ExecutionContext c=context();return view(require(id,c),false);}
 @Transactional(readOnly=true) List<BatchView> list(){ExecutionContext c=context();return batches.findTop100ByTenantIdAndOrganizationIdOrderByCreatedAtDesc(c.tenantId(),c.organizationId()).stream().map(v->view(v,false)).toList();}

 private void saveItem(ExecutionContext c,ReconciliationBatch b,Long paymentId,String externalNo,String match,BigDecimal local,BigDecimal external){ReconciliationItem item=items.save(new ReconciliationItem(c.tenantId(),b.id(),paymentId,externalNo,match,money(local),money(external),b.currencyCode()));events.save(new ReconciliationItemEvent(c.tenantId(),item.id(),"DETECT",null,item.status(),"DETECT-"+item.id(),c.subjectId(),match));}
 private BatchView view(ReconciliationBatch b,boolean duplicate){List<ItemView> detail=items.findByTenantIdAndReconciliationBatchIdOrderById(b.tenantId(),b.id()).stream().map(i->new ItemView(i.id(),i.revision(),i.paymentId(),i.externalTransactionNo(),i.matchType(),i.status(),i.localAmount(),i.externalAmount(),i.differenceAmount(),i.currencyCode(),i.resolvedAt(),i.resolution())).toList();return new BatchView(b.id(),b.revision(),b.batchNo(),b.commandCode(),b.reconciliationType(),b.status(),b.sourceCode(),b.paymentMethodCode(),b.externalBatchNo(),b.businessDate(),b.localCount(),b.externalCount(),b.differenceCount(),b.localAmount(),b.externalAmount(),b.differenceAmount(),b.currencyCode(),b.createdAt(),b.completedAt(),duplicate,detail);}
 private ReconciliationBatch lock(Long id,ExecutionContext c){ReconciliationBatch b=batches.lock(id,c.tenantId()).orElseThrow(()->notFound("RECON_BATCH_NOT_FOUND","未找到对账批次"));access(b,c);return b;}
 private ReconciliationBatch require(Long id,ExecutionContext c){ReconciliationBatch b=batches.findByIdAndTenantId(id,c.tenantId()).orElseThrow(()->notFound("RECON_BATCH_NOT_FOUND","未找到对账批次"));access(b,c);return b;}
 private void access(ReconciliationBatch b,ExecutionContext c){if(!Objects.equals(b.organizationId(),c.organizationId()))throw forbidden("RECON_BATCH_FORBIDDEN","当前机构不能访问该对账批次");}
 private void same(ReconciliationBatch b,PrepareCommand i){if(!Objects.equals(b.sourceCode(),upper(i.sourceCode()))||!Objects.equals(b.businessDate(),i.businessDate())||!Objects.equals(b.paymentMethodCode(),upper(i.paymentMethodCode())))throw conflict("RECON_COMMAND_REUSED","对账幂等命令已用于不同批次范围");}
 private void validateExternal(ReconciliationBatch b,ExternalTransaction x){if(x==null)throw badRequest("RECON_EXTERNAL_LINE_INVALID","渠道对账明细不能为空");if(!b.currencyCode().equalsIgnoreCase(required(x.currencyCode(),"RECON_EXTERNAL_CURRENCY_REQUIRED","渠道币种不能为空")))throw conflict("RECON_EXTERNAL_CURRENCY_MISMATCH","渠道明细币种与批次不一致");if(x.amount()==null||x.amount().signum()<0)throw badRequest("RECON_EXTERNAL_AMOUNT_INVALID","渠道金额不能为空且不能为负数");}
 private BigDecimal sumLocal(List<Payment> v){return v.stream().map(this::signed).reduce(zero(),BigDecimal::add);} private BigDecimal sumExternal(List<ExternalTransaction> v){return v.stream().map(this::signed).reduce(zero(),BigDecimal::add);}
 private BigDecimal signed(Payment p){return "REFUND".equals(p.paymentType())?money(p.amount()).negate():money(p.amount());} private BigDecimal signed(ExternalTransaction x){return "REFUND".equalsIgnoreCase(x.transactionType())?money(x.amount()).negate():money(x.amount());}
 private boolean success(String s){return s!=null&&List.of("SUCCESS","SUCCEEDED","COMPLETED","REFUNDED").contains(s.trim().toUpperCase());}
 private ExecutionContext context(){ExecutionContext c=contexts.requireCurrent();if(!c.hasWorkContext())throw forbidden("RECON_WORK_CONTEXT_REQUIRED","对账前必须选择工作机构");return c;}
 private BigDecimal zero(){return BigDecimal.ZERO.setScale(6);}private BigDecimal money(BigDecimal v){return v.setScale(6,RoundingMode.HALF_UP);}private String clean(String v){return v==null||v.isBlank()?null:v.trim();}private String upper(String v){String x=clean(v);return x==null?null:x.toUpperCase();}private String required(String v,String c,String m){String x=clean(v);if(x==null)throw badRequest(c,m);return x;}
 record PrepareCommand(String commandCode,String reconciliationType,String sourceCode,String paymentMethodCode,LocalDate businessDate,String currencyCode){} record PrepareResult(ReconciliationBatch batch,boolean duplicate){}
 record ResolveCommand(String commandCode,String reason,boolean ignore){}
 public record ItemView(Long id,long revision,Long paymentId,String externalTransactionNo,String matchType,String status,BigDecimal localAmount,BigDecimal externalAmount,BigDecimal differenceAmount,String currencyCode,Instant resolvedAt,String resolution){}
 public record BatchView(Long id,long revision,String batchNo,String commandCode,String reconciliationType,String status,String sourceCode,String paymentMethodCode,String externalBatchNo,LocalDate businessDate,int localCount,int externalCount,int differenceCount,BigDecimal localAmount,BigDecimal externalAmount,BigDecimal differenceAmount,String currencyCode,Instant createdAt,Instant completedAt,boolean duplicate,List<ItemView> items){}
}
