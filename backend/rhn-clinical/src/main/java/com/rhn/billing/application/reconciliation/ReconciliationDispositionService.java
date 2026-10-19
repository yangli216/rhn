package com.rhn.billing.application.reconciliation;

import com.rhn.billing.application.PaymentOrchestrationService;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.util.*;
import static com.rhn.billing.api.PaymentReconciliation.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Explanation/approval state is independent of matching. Recovery delegates to the original payment transaction. */
@Service
public class ReconciliationDispositionService {
 private final ReconciliationAccess access;private final ReconciliationReadService reads;private final ReconciliationTaskService taskAccess;
 private final ReconciliationTaskRepository tasks;private final ReconciliationBatchRepository batches;private final ReconciliationItemRepository items;private final ReconciliationItemEventRepository events;
 private final ReconciliationStatementRowRepository rows;private final ReconciliationStatementFileRepository files;private final ReconciliationActionRepository actions;
 private final PaymentOrchestrationService payments;private final JsonCodec json;private final TransactionTemplate tx;
 public ReconciliationDispositionService(ReconciliationAccess access,ReconciliationReadService reads,ReconciliationTaskService taskAccess,ReconciliationTaskRepository tasks,ReconciliationBatchRepository batches,ReconciliationItemRepository items,ReconciliationItemEventRepository events,ReconciliationStatementRowRepository rows,ReconciliationStatementFileRepository files,ReconciliationActionRepository actions,PaymentOrchestrationService payments,JsonCodec json,PlatformTransactionManager tm){this.access=access;this.reads=reads;this.taskAccess=taskAccess;this.tasks=tasks;this.batches=batches;this.items=items;this.events=events;this.rows=rows;this.files=files;this.actions=actions;this.payments=payments;this.json=json;tx=new TransactionTemplate(tm);}
 @Transactional
 public void propose(Long id,long revision,String command,String reason){var c=access.require(HANDLE);requireItemScope(id,c);var hash=hash(c,"PROPOSE",id,revision,reason);
  if(replay(c,command,hash))return;var item=lockedItem(id,c);version(item.revision(),revision);if(!"OPEN".equals(item.status()))throw conflict("RECON_ITEM_NOT_OPEN","只有未处置差异可以提交例外说明");
  String text=reason(reason);item.propose(c.subjectId(),text);actions.save(action(c,command,hash,"PROPOSE",id,text));events.save(new ReconciliationItemEvent(c.tenantId(),id,"SUBMIT","OPEN",item.status(),command,c.subjectId(),text).fingerprint(hash));
 }
 @Transactional
 public void review(Long id,long revision,String command,String reason,boolean approve){var c=access.require(REVIEW);requireItemScope(id,c);String text=reason(reason);String hash=hash(c,"REVIEW|"+approve,id,revision,text);
  if(replay(c,command,hash))return;var item=lockedItem(id,c);version(item.revision(),revision);if(!"REVIEW_PENDING".equals(item.status()))throw conflict("RECON_REVIEW_NOT_PENDING","差异尚未提交复核");if(c.subjectId().equals(item.resolvedBy()))throw forbidden("RECON_SELF_REVIEW_FORBIDDEN","不能复核自己提交的例外说明");
  item.review(c.subjectId(),approve);actions.save(action(c,command,hash,"REVIEW",id,text));events.save(new ReconciliationItemEvent(c.tenantId(),id,approve?"APPROVE":"REJECT","REVIEW_PENDING",item.status(),command,c.subjectId(),text).fingerprint(hash));
 }
 @Transactional
 public void close(Long batchId,long revision,String command,String reason){var c=access.require(REVIEW);reads.requireBatch(batchId);String text=reason(reason),hash=hash(c,"CLOSE",batchId,revision,text);
  if(replay(c,command,hash))return;var b=lockedBatch(batchId,c);version(b.revision(),revision);if(!"OPEN".equals(b.closure()))throw conflict("RECON_BATCH_CLOSED","此版本已结案");
  long open=items.countByTenantIdAndReconciliationBatchIdAndStatus(c.tenantId(),b.id(),"OPEN")+items.countByTenantIdAndReconciliationBatchIdAndStatus(c.tenantId(),b.id(),"REVIEW_PENDING");
  if(open>0)throw conflict("RECON_DIFFERENCES_OPEN","仍有未核实或未复核差异，不能结案");
  b.close(b.differenceCount()>0,c.subjectId());actions.save(action(c,command,hash,"CLOSE",batchId,text));
 }
 public PaymentReconciliationVerificationView query(Long id,long revision,String command){var c=access.require(HANDLE);
  var work=tx.execute(status->{requireItemScope(id,c);command(command);String hash=hash(c,"QUERY",id,revision,"");var old=actions.lock(c.tenantId(),command).orElse(null);
   if(old!=null){same(old,hash);if("COMPLETED".equals(old.status()))return new QueryWork(null,decode(old.result()));if(!old.expired())return new QueryWork(null,new PaymentReconciliationVerificationView("PENDING",null,"原核查命令仍在处理，请稍后查看"));}
   var item=lockedItem(id,c);version(item.revision(),revision);if(item.paymentOrderId()==null)throw conflict("RECON_ORDER_UNAVAILABLE","此记录没有可信原支付指令，不能自动补单");
   if(old==null){old=action(c,command,hash,"QUERY",id,null);old=actions.save(old);}old.begin();return new QueryWork(item.paymentOrderId(),null);
  });
  if(work==null)throw new IllegalStateException();if(work.receipt()!=null)return work.receipt();
  PaymentReconciliationVerificationView result;
  try{var r=payments.verifyForReconciliation(work.orderId());result=new PaymentReconciliationVerificationView(r.outcome().name(),r.completedAmount(),"核查已记录；在途指令沿用原流程恢复，原对账版本保持不变，请重新核对获取新版本");}
  catch(RuntimeException e){result=new PaymentReconciliationVerificationView("PENDING",null,"核查未获得可发布的最终结果，请检查原单恢复状态后重试；不会重新发起收退款");}
  var receipt=result;tx.executeWithoutResult(status->{var a=actions.lock(c.tenantId(),command).orElseThrow();a.completed(json.write(receipt));var item=items.findById(id).orElseThrow();events.save(new ReconciliationItemEvent(c.tenantId(),id,"QUERY",item.status(),item.status(),command,c.subjectId(),receipt.message()).fingerprint(a.inputHash()));});return result;
 }
 @Transactional
 public void merchantDisposition(Long rowId,long revision,String command,String reason,Boolean approve){var c=access.require(approve==null?HANDLE:REVIEW);access.requireMerchant(c);
  var row=rows.findByIdAndTenantId(rowId,c.tenantId()).orElseThrow(()->notFound("RECON_ROW_NOT_FOUND","未找到商户账单行"));var file=files.findByIdAndTenantId(row.fileId(),c.tenantId()).orElseThrow();var task=tasks.lock(file.taskId()).orElseThrow();taskAccess.requireScope(task,c.tenantId(),c.organizationId());
  row=rows.lock(c.tenantId(),rowId).orElseThrow();if(row.organizationId()!=null)throw conflict("RECON_ROW_ALREADY_ALLOCATED","机构已归属明细应走机构差异处置");String text=reason(reason),hash=hash(c,"MERCHANT|"+approve,rowId,revision,text);if(replay(c,command,hash))return;latest(task,row.fileId());version(row.revision(),revision);
  if(approve==null){if(!"OPEN".equals(row.disposition()))throw conflict("RECON_ROW_NOT_OPEN","账单行不处于待处置状态");row.propose(c.subjectId(),text);}
  else{if(!"REVIEW_PENDING".equals(row.disposition()))throw conflict("RECON_REVIEW_NOT_PENDING","账单行尚未提交复核");if(c.subjectId().equals(row.proposerId()))throw forbidden("RECON_SELF_REVIEW_FORBIDDEN","不能复核自己提交的商户例外");row.review(c.subjectId(),approve);}
  actions.save(action(c,command,hash,approve==null?"MERCHANT_PROPOSE":"MERCHANT_REVIEW",rowId,text));
 }
 private void requireItemScope(Long id,ExecutionContext c){var item=items.findById(id).filter(i->i.tenantId().equals(c.tenantId())).orElseThrow(()->notFound("RECON_ITEM_NOT_FOUND","未找到对账差异"));reads.requireBatch(item.reconciliationBatchId());}
 private ReconciliationItem lockedItem(Long id,ExecutionContext c){var candidate=items.findById(id).filter(i->i.tenantId().equals(c.tenantId())).orElseThrow(()->notFound("RECON_ITEM_NOT_FOUND","未找到对账差异"));lockedBatch(candidate.reconciliationBatchId(),c);return items.lock(id,c.tenantId()).orElseThrow();}
 private ReconciliationBatch lockedBatch(Long id,ExecutionContext c){var candidate=reads.requireBatch(id);if(candidate.reconciliationTaskId()==null)throw conflict("RECON_LEGACY_BATCH","历史标准化批次不支持本期版本化处置");var task=tasks.lock(candidate.reconciliationTaskId()).orElseThrow();latest(task,candidate.statementFileId());var b=batches.lock(id,c.tenantId()).orElseThrow();if(!"OPEN".equals(b.closure()))throw conflict("RECON_BATCH_CLOSED","已结案版本不能继续处置");return b;}
 private void latest(ReconciliationTask task,Long file){if(!"COMPLETED".equals(task.status()))throw conflict("RECON_TASK_NOT_COMPLETE","当前拉取任务尚未成功，请取得最新结果后处置");if(!Objects.equals(task.latestFileId(),file))throw conflict("RECON_VERSION_SUPERSEDED","账单已有新版本，请在最新版本上处置");}
 private void version(long actual,long expected){if(actual!=expected)throw new StaleRevisionException(actual);}
 private String hash(ExecutionContext c,String op,Long id,long revision,String reason){return ReconciliationFingerprints.hash(c.tenantId()+"|"+c.organizationId()+"|"+c.subjectId()+"|"+op+"|"+id+"|"+revision+"|"+reason);}
 private boolean replay(ExecutionContext c,String command,String hash){command(command);var old=actions.findByTenantIdAndCommandCode(c.tenantId(),command).orElse(null);if(old==null)return false;same(old,hash);return true;}
 private ReconciliationAction action(ExecutionContext c,String command,String hash,String op,Long target,String reason){command(command);return new ReconciliationAction(c.tenantId(),command,hash,op,target,c.subjectId(),reason);}
 private void command(String c){if(c==null||c.isBlank()||c.length()>128)throw badRequest("RECON_COMMAND_INVALID","对账命令无效");}
 private String reason(String reason){if(reason==null||reason.isBlank()||reason.length()>2000)throw badRequest("RECON_REASON_REQUIRED","请填写不超过2000字的核查或复核依据");return reason.trim();}
 private void same(ReconciliationAction action,String hash){if(!action.inputHash().equals(hash))throw conflict("RECON_COMMAND_REUSED","同一对账命令不能用于不同输入");}
 private PaymentReconciliationVerificationView decode(String value){var map=json.readObject(value);return new PaymentReconciliationVerificationView((String)map.get("outcome"),map.get("completedAmount")==null?null:new BigDecimal(map.get("completedAmount").toString()),(String)map.get("message"));}
 private record QueryWork(Long orderId,PaymentReconciliationVerificationView receipt){}
 public record PaymentReconciliationVerificationView(@DictionaryBinding("BIL_RECON_QUERY_OUTCOME")String outcome,BigDecimal completedAmount,String message){}
}
