package com.rhn.billing.application.reconciliation;

import com.rhn.platform.dictionary.api.*;
import com.rhn.billing.domain.ReconciliationBatchStatus;
import org.springframework.stereotype.Component;
import java.util.List;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.*;

@Component
class PaymentReconciliationEnums implements SystemEnumContribution {
 public List<SystemEnumDefinition> systemEnums(){return List.of(
  of("BIL_RECON_TASK_STATUS","支付对账任务状态","商户账单异步任务及尝试状态",items(
   "QUEUED","排队中","等待执行","RUNNING","处理中","正在获取及核对账单","WAITING_STATEMENT","待出账确认","渠道未提供可信账单",
   "RETRY_WAIT","等待重试","暂时故障后重试","COMPLETED","处理完成","已发布结果；不等同财务对平","FAILED","处理失败","需要人工核查",
   "NO_CHANGE","证据未变化","保留原执行版本","SUPERSEDED","租约已接管","旧尝试不得发布结果")),
  of("BIL_RECON_RESULT","支付交易核对结果","当前执行版本的逐笔比较结果",ReconciliationBatchStatus.class,items(
   "IMPORTED","待核对","尚未完成比较","MATCHED","本机构交易对平","指定账单范围逐笔一致","DIFFERENCE","存在差异","有待核查交易",
   "RESOLVED","历史批次已处置","旧流程结论，不代表资金已对平","FAILED","核对失败","未发布有效结果")),
  of("BIL_RECON_CLOSURE","支付对账结案状态","财务结案与逐笔对平分开",items(
   "OPEN","未结案","等待核查或财务复核","CLOSED_MATCHED","对平结案","本机构交易核对一致","CLOSED_WITH_EXCEPTION","带例外结案","差异经复核接受，仍保留差异金额")),
  of("BIL_RECON_MATCH_TYPE","支付对账逐笔结果","逐笔身份金额及状态比较",items(
   "MATCHED","一致","逐笔一致","LOCAL_ONLY","本地单边","账单未见本地成功交易","EXTERNAL_ONLY","渠道单边","历史标准化渠道单边",
   "AMOUNT_DIFFERENCE","金额差异","业务收退款金额不一致","STATUS_DIFFERENCE","状态差异","账单状态与本地资金事实矛盾",
   "DUPLICATE","重复或多义","不能唯一匹配","TIME_DIFFERENCE","跨日已关联","身份金额一致但本地记账日不同",
   "IDENTITY_DIFFERENCE","身份差异","商户应用原单币种或流水不一致","AWAITING_CONFIRMATION","等待最终状态","受理或在途不能当成功",
   "LOCAL_NOT_POSTED","原单待恢复","已有原指令但没有成功资金事实","REVERSAL_REVIEW","撤销待核查","撤销不能直接补造退款",
   "LEDGER_DIFFERENCE","账务链差异","资金事实与账务分录不一致")),
  of("BIL_RECON_DISPOSITION","支付对账处置状态","说明及复核状态，不修改资金事实",items(
   "OPEN","待核查","差异尚未处理","RESOLVED","已核对","匹配一致或历史处置","IGNORED","历史忽略","旧流程忽略结论",
   "REVIEW_PENDING","待复核","已提交例外依据","ACCEPTED_EXCEPTION","已接受例外","经其他人员复核，仍不算对平")),
  of("BIL_RECON_TXN_TYPE","支付账单交易类型","账单中的收退事件",items(
   "PAYMENT","收款","渠道收款","REFUND","退款","渠道退款事件","REVERSAL","撤销","渠道撤销事件")),
  of("BIL_RECON_CHANNEL_STATUS","渠道账单状态","适配器保留的账单交易或退款状态",items(
   "SUCCESS","成功","账单声明成功","PROCESSING","处理中","退款未最终完成","FAIL","失败","账单声明失败","CHANGE","异常待处理","渠道退款异常")),
  of("BIL_RECON_EVENT_TYPE","支付对账事件","逐笔核查和复核事件",items(
   "DETECT","发现差异","首次核对","RESOLVE","历史处置","历史处置结果","IGNORE","历史忽略","历史忽略结果","REOPEN","重新核查","差异重开",
   "SUBMIT","提交依据","待他人复核","APPROVE","复核接受","接受例外不等同对平","REJECT","复核退回","退回重新核查","QUERY","查询原单","核查原指令状态")),
  of("BIL_RECON_QUERY_OUTCOME","支付对账查询结果","原单核查的确定性结果",items(
   "SUCCEEDED","查询成功","取得渠道成功结果","PENDING","待确认","未取得可确认的最终结果","FAILED","渠道失败","渠道明确失败",
   "CANCELLED","已取消","渠道明确取消","EXPIRED","已过期","渠道明确过期"))
 );}
}
