package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.ReconciliationAdapterRegistry;
import com.rhn.billing.domain.ReconciliationTask;
import com.rhn.billing.domain.ReconciliationAttempt;
import com.rhn.billing.infrastructure.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.data.domain.PageRequest;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;

/** Network I/O is outside database transactions and has no ambient human work context. */
@Service
public class ReconciliationWorker {
 private final ReconciliationAttemptRepository attempts;private final ReconciliationTaskRepository tasks;private final ReconciliationPolicyRepository policies;private final ReconciliationTaskService commands;private final ReconciliationAdapterRegistry adapters;private final ReconciliationRunService runs;private final TransactionTemplate tx;
 public ReconciliationWorker(ReconciliationAttemptRepository attempts,ReconciliationTaskRepository tasks,ReconciliationPolicyRepository policies,ReconciliationTaskService commands,ReconciliationAdapterRegistry adapters,ReconciliationRunService runs,PlatformTransactionManager tm){this.attempts=attempts;this.tasks=tasks;this.policies=policies;this.commands=commands;this.adapters=adapters;this.runs=runs;tx=new TransactionTemplate(tm);}
 public int processDue(int limit){var ids=tasks.due(Instant.now(),PageRequest.of(0,Math.max(1,Math.min(20,limit))));ids.forEach(this::process);return ids.size();}
 public void schedule(){
  for(var policy:policies.findByAutoEnabledTrue()){
   try{
    var cap=adapters.require(policy.paymentMethodCode()).statementCapability();var now=ZonedDateTime.now(ZoneId.of(cap.zoneId()));
    if(now.toLocalTime().isBefore(LocalTime.parse(policy.fetchTime())))continue;
    for(int days=1;days<=policy.backfillDays();days++){
     LocalDate date=now.toLocalDate().minusDays(days);
     String command="SCHEDULE-"+policy.id()+"-"+now.toLocalDate()+"-"+date;
     commands.enqueueScheduled(policy.tenantId(),policy.organizationId(),policy.updatedBy(),policy.paymentMethodCode(),date,command,now.toLocalDate().atTime(LocalTime.parse(policy.fetchTime())).atZone(now.getZone()).toInstant());
    }
    tx.executeWithoutResult(s->policies.findById(policy.id()).ifPresent(p->p.scheduleError(null)));
   }catch(RuntimeException e){tx.executeWithoutResult(s->policies.findById(policy.id()).ifPresent(p->p.scheduleError("自动对账未能创建任务，请检查商户绑定、账单日期及渠道配置；其他商户继续处理")));}
  }
 }
 public void process(Long id){
  Work work=tx.execute(status->tasks.lock(id).filter(t->t.claim(Instant.now())).map(t->{attempts.findByTenantIdAndTaskIdAndClaimToken(t.tenantId(),t.id(),t.claimToken()-1).filter(a->"RUNNING".equals(a.status())).ifPresent(a->a.finish("SUPERSEDED",null,"LEASE_EXPIRED","租约已过期，由新尝试接管"));attempts.save(new ReconciliationAttempt(t.tenantId(),t.id(),t.attempt(),t.claimToken()));return new Work(t.id(),t.claimToken(),new StatementRequest(t.tenantId(),t.credentialOrganizationId(),new MerchantScope(t.merchantScope(),t.merchantId(),t.environment(),t.appId()),t.businessDate(),t.currencyCode(),t.id(),t.attempt()),t.paymentMethodCode());}).orElse(null));
  if(work==null)return;
  try{
   var adapter=adapters.require(work.method());var result=adapter.download(work.request());
   if(result.state()!=FetchState.AVAILABLE&&result.state()!=FetchState.NO_DATA_CONFIRMED){
    boolean retry=Set.of(FetchState.NOT_READY,FetchState.NOT_FOUND,FetchState.RATE_LIMITED).contains(result.state());
    fail(work,"STATEMENT_"+result.state(),message(result.state()),retry,result.state()==FetchState.NOT_READY||result.state()==FetchState.NOT_FOUND);return;
   }
   if(runs.stage(work.id(),work.token(),result)==null)return;
   ParsedStatement parsed;
   if(result.state()==FetchState.NO_DATA_CONFIRMED){BigDecimal zero=BigDecimal.ZERO.setScale(6);parsed=new ParsedStatement(List.of(),new StatementSummary(0,zero,zero,zero,zero,zero),adapter.statementCapability().parserVersion());}
   else parsed=adapter.parse(work.request(),result);
   runs.apply(work.id(),work.token(),work.request(),result,parsed);
  }catch(StatementProtocolException e){fail(work,"STATEMENT_PROTOCOL_INVALID",e.getMessage(),false,false);}
  catch(RuntimeException e){fail(work,"STATEMENT_PROCESSING_FAILED","账单处理失败，未发布新结果；请检查渠道凭证、权限及服务状态后重试",true,false);}
 }
 private void fail(Work work,String code,String message,boolean retry,boolean waiting){tx.executeWithoutResult(status->tasks.lock(work.id()).filter(t->t.owns(work.token())).ifPresent(t->{t.failed(code,message,retry&&t.attempt()<8,waiting);attempts.findByTenantIdAndTaskIdAndClaimToken(t.tenantId(),t.id(),work.token()).ifPresent(a->a.finish(t.status(),null,code,message));}));}
 private String message(FetchState state){return switch(state){case NOT_READY->"渠道账单尚未生成，等待补拉";case NOT_FOUND->"渠道未提供该日账单，不能据此确认零交易";case RATE_LIMITED->"渠道限流，稍后重试";case AUTH_FAILED->"账单权限或渠道凭证验证失败";case UNSUPPORTED->"当前商户未开通此账单能力";default->"账单暂不可用";};}
 private record Work(Long id,long token,StatementRequest request,String method){}
}
