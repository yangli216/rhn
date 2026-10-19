package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.ReconciliationAdapterRegistry;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.api.StaleRevisionException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rhn.billing.api.PaymentReconciliation.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class ReconciliationTaskService {
 private final ReconciliationAccess access;private final ReconciliationAdapterRegistry adapters;private final ReconciliationPolicyService policies;
 private final ReconciliationMerchantAccountRepository accounts;private final ReconciliationTaskRepository tasks;private final ReconciliationActionRepository actions;
 public ReconciliationTaskService(ReconciliationAccess access,ReconciliationAdapterRegistry adapters,ReconciliationPolicyService policies,ReconciliationMerchantAccountRepository accounts,ReconciliationTaskRepository tasks,ReconciliationActionRepository actions){this.access=access;this.adapters=adapters;this.policies=policies;this.accounts=accounts;this.tasks=tasks;this.actions=actions;}
 @Transactional
 public ReconciliationTask enqueue(String method,LocalDate date,String command){var c=access.require(RUN);return enqueue(c.tenantId(),c.organizationId(),c.subjectId(),method,date,command);}
 @Transactional
 public ReconciliationTask enqueue(Long tenant,Long org,Long actor,String method,LocalDate date,String command){
  if(command==null||command.isBlank()||command.length()>128)throw badRequest("RECON_COMMAND_INVALID","对账命令不能为空且不能超过128字");
  var adapter=adapters.require(method);var capability=adapter.statementCapability();LocalDate today=LocalDate.now(ZoneId.of(capability.zoneId()));
  if(date==null||!date.isBefore(today)||date.isBefore(today.minusDays(capability.historyDays())))throw badRequest("RECON_DATE_INVALID","账单日必须为渠道可下载范围内的历史日期");
  var scope=adapter.merchantScope(tenant,org);policies.ensureBinding(tenant,org,method,scope.fingerprint(),actor);
  accounts.lock(scope.fingerprint()).orElseThrow();
  String hash=ReconciliationFingerprints.hash("CREATE|"+tenant+"|"+org+"|"+method+"|"+scope.fingerprint()+"|"+date+"|CNY");
  var previous=actions.findByTenantIdAndCommandCode(tenant,command).orElse(null);
  if(previous!=null){same(previous,hash);return tasks.findByIdAndTenantId(previous.targetId(),tenant).orElseThrow();}
  var task=tasks.findByTenantIdAndMerchantScopeAndBusinessDateAndCurrencyCode(tenant,scope.fingerprint(),date,"CNY").orElse(null);
  if(task==null)task=tasks.saveAndFlush(new ReconciliationTask(tenant,org,method,capability.adapterCode(),scope.fingerprint(),scope.merchantId(),scope.environment(),scope.appId(),date,"CNY",actor,command));
  actions.save(new ReconciliationAction(tenant,command,hash,"CREATE",task.id(),actor,null));return task;
 }
 @Transactional
 public ReconciliationTask retry(Long id,long expected,String command){var c=access.require(RUN);var task=tasks.lock(id).orElseThrow(()->notFound("RECON_TASK_NOT_FOUND","未找到对账任务"));requireScope(task,c.tenantId(),c.organizationId());
  String hash=ReconciliationFingerprints.hash("RETRY|"+c.organizationId()+"|"+id+"|"+expected);var old=actions.findByTenantIdAndCommandCode(c.tenantId(),command).orElse(null);
  if(old!=null){same(old,hash);return task;}if(task.revision()!=expected)throw new StaleRevisionException(task.revision());
  if("RUNNING".equals(task.status()))throw conflict("RECON_TASK_RUNNING","对账正在执行，请等待当前任务结束");
  task.retry(Instant.now());actions.save(new ReconciliationAction(c.tenantId(),command,hash,"RETRY",id,c.subjectId(),null));tasks.flush();return task;
 }
 @Transactional
 public ReconciliationTask enqueueScheduled(Long tenant,Long org,Long actor,String method,LocalDate date,String command,Instant refreshBefore){
  var task=enqueue(tenant,org,actor,method,date,command);
  var locked=tasks.lock(task.id()).orElseThrow();
  if("COMPLETED".equals(locked.status())&&locked.completedAt()!=null&&locked.completedAt().isBefore(refreshBefore))locked.retry(Instant.now());
  return locked;
 }
 public void requireScope(ReconciliationTask task,Long tenant,Long org){
  if(!task.tenantId().equals(tenant))throw notFound("RECON_TASK_NOT_FOUND","未找到对账任务");
  var scope=adapters.require(task.paymentMethodCode()).merchantScope(tenant,org);
  if(!scope.fingerprint().equals(task.merchantScope()))throw forbidden("RECON_TASK_SCOPE_FORBIDDEN","当前机构不属于此对账商户范围");
 }
 private void same(ReconciliationAction action,String hash){if(!action.inputHash().equals(hash))throw conflict("RECON_COMMAND_REUSED","同一对账命令不能用于不同输入");}
}
