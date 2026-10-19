package com.rhn;

import com.rhn.billing.api.*;
import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.reconciliation.*;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.context.*;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(PaymentTransactionReconciliationTest.Gateways.class)
@ResetDatabaseBeforeEachTestMethod
class PaymentTransactionReconciliationTest extends RhnIntegrationTestSupport {
 @MockitoBean ExecutionContextProvider contexts;
 @Autowired ReconciliationPolicyService policies;@Autowired ReconciliationWorker worker;@Autowired ReconciliationTaskService commands;@Autowired ReconciliationReadService reads;@Autowired ReconciliationDispositionService disposition;
 @Autowired ReconciliationTaskRepository tasks;@Autowired ReconciliationBatchRepository batches;@Autowired ReconciliationItemRepository items;@Autowired ReconciliationStatementRowRepository rows;
 @Autowired ReconciliationStatementFileRepository files;@Autowired ReconciliationAttemptRepository attempts;@Autowired PatientAccountRepository accounts;@Autowired InvoiceRepository invoices;
 @Autowired PaymentOrderRepository orders;@Autowired PaymentRepository payments;@Autowired LedgerEntryRepository ledger;@Autowired JdbcTemplate jdbc;@Autowired Gateway gateway;
 final Long tenant=Long.valueOf(TENANT),org=Long.valueOf(ORGANIZATION),dept=Long.valueOf(DEPARTMENT),user=362387869790222L;
 final LocalDate day=LocalDate.now(ZoneId.of("Asia/Shanghai")).minusDays(1);
 final Instant at=day.atTime(12,0).atZone(ZoneId.of("Asia/Shanghai")).toInstant();
 @BeforeEach void setup(){gateway.state=FetchState.AVAILABLE;gateway.lines=List.of();gateway.version="1";gateway.calls=0;gateway.failParse=false;gateway.availableAfter="10:00";lineCounter=0;when(contexts.requireCurrent()).thenReturn(manager(user));}
 ExecutionContext manager(Long actor){return new ExecutionContext(tenant,actor,"finance","recon-test",Set.of("ROLE_ADMIN",PaymentReconciliation.READ,PaymentReconciliation.RUN,PaymentReconciliation.HANDLE,PaymentReconciliation.REVIEW,PaymentReconciliation.EXPORT,PaymentReconciliation.MERCHANT_READ),org,dept,"TENANT",Set.of(org),Set.of(dept));}
 Long start(String command){return commands.enqueue("WECHAT",day,command).id();}
 ReconciliationReadService.PaymentReconciliationBatchView result(Long id){return reads.get(id).latestBatch();}
 @Test void asyncDownloadPreservesEvidenceAndUnknownRowsWithoutFabricatingPayments(){
  gateway.lines=List.of(row("P987654321",null,"T-UNKNOWN",BigDecimal.TEN,true,"SUCCESS"));
  Long id=start("unknown");assertEquals("QUEUED",reads.get(id).status());worker.process(id);
  assertEquals("COMPLETED",reads.get(id).status());assertFalse(reads.get(id).merchantAllocationComplete());
  assertEquals(1,reads.unallocated(id,0,25).totalElements());assertEquals(0,result(id).localCount());
  assertEquals(0,jdbc.queryForObject("select count(*) from RHN_BIL_PAY",Integer.class));
  var file=files.findById(reads.get(id).latestFileId()).orElseThrow();assertTrue(file.isComplete());assertTrue(file.encryptedFiles().startsWith("enc:v1:"));assertFalse(file.encryptedFiles().contains("fixture-version"));
  assertEquals(1,attempts.findTop50ByTenantIdAndTaskIdOrderByAttemptDesc(tenant,id).size());
 }
 @Test void noStatementIsNotAnEmptyStatementAndFailuresKeepThePreviousVersion(){
  Long id=start("not-ready");gateway.state=FetchState.NOT_FOUND;worker.process(id);assertEquals("WAITING_STATEMENT",reads.get(id).status());assertNull(reads.get(id).latestFileId());
  var t=tasks.findById(id).orElseThrow();commands.retry(id,t.revision(),"retry-ready");gateway.state=FetchState.AVAILABLE;worker.process(id);Long file=reads.get(id).latestFileId();assertNotNull(file);
  t=tasks.findById(id).orElseThrow();commands.retry(id,t.revision(),"retry-failed");gateway.state=FetchState.AUTH_FAILED;worker.process(id);assertEquals("FAILED",reads.get(id).status());assertEquals(file,reads.get(id).latestFileId());
  assertEquals(3,attempts.findTop50ByTenantIdAndTaskIdOrderByAttemptDesc(tenant,id).size());
 }
 @Test void repeatedCommandsAndSameSnapshotsDoNotCreateNewRuns(){
  Long id=start("dedupe");assertEquals(id,start("dedupe"));worker.process(id);Long file=reads.get(id).latestFileId();
  var task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"same-file");worker.process(id);assertEquals(file,reads.get(id).latestFileId());assertEquals(1,reads.detail(id).versions().size());
  assertThrows(com.rhn.shared.api.BusinessException.class,()->commands.enqueue("WECHAT",day.minusDays(1),"dedupe"));
 }
 @Test void paymentAndTwoPartialRefundsHaveIndependentIdentitiesAndNoDoublePosting() throws Exception {
  Fixture f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");var r1=fund(f,"REFUND",new BigDecimal("20"),pay,at.plusSeconds(1),"RF-1");var r2=fund(f,"REFUND",new BigDecimal("30"),pay,at.plusSeconds(2),"RF-2");
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"),row("P"+pay.paymentOrderId(),"R"+r1.paymentOrderId(),"RF-1",new BigDecimal("20"),true,"SUCCESS"),row("P"+pay.paymentOrderId(),"R"+r2.paymentOrderId(),"RF-2",new BigDecimal("30"),true,"SUCCESS"));
  Long id=start("partial-refunds");worker.process(id);var b=result(id);assertEquals("MATCHED",b.status());assertEquals(3,b.localCount());assertEquals(3,b.externalCount());assertEquals(0,b.differenceCount());assertEquals(0,new BigDecimal("50").compareTo(b.localAmount()));assertEquals(0,new BigDecimal("50").compareTo(b.finalRefunds()));assertEquals(3,payments.count());
  Long file=reads.get(id).latestFileId();var task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"partial-refunds-again");worker.process(id);assertEquals(file,reads.get(id).latestFileId());assertEquals(1,reads.detail(id).versions().size());
 }
 @Test void changedInvoiceAndPaymentChannelInvalidateThePublishedSnapshot() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"));
  Long id=start("snapshot-identity");worker.process(id);Long originalFile=reads.get(id).latestFileId();assertEquals("MATCHED",result(id).status());
  jdbc.update("update RHN_BIL_PAY set ID_INVOICE=null where ID_PAY=?",pay.id());
  var task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"changed-invoice");worker.process(id);
  assertNotEquals(originalFile,reads.get(id).latestFileId());assertEquals("IDENTITY_DIFFERENCE",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());
  jdbc.update("update RHN_BIL_PAY set ID_INVOICE=?,CD_PAY_METHOD='ALIPAY' where ID_PAY=?",f.invoice.id(),pay.id());
  task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"changed-channel");worker.process(id);
  assertEquals(3,reads.detail(id).versions().size());assertEquals("IDENTITY_DIFFERENCE",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());
 }
 @Test void changedOriginalPaymentInvalidatesACrossDayRefundSnapshot() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at.minusSeconds(86400),"T-PAY");var refund=fund(f,"REFUND",new BigDecimal("20"),pay,at,"RF-1");
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),"R"+refund.paymentOrderId(),"RF-1",new BigDecimal("20"),true,"SUCCESS"));
  Long id=start("refund-snapshot");worker.process(id);Long originalFile=reads.get(id).latestFileId();assertEquals("MATCHED",result(id).status());
  jdbc.update("update RHN_BIL_PAY set CD_EXT_TXN_NO='CHANGED' where ID_PAY=?",pay.id());
  var task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"changed-original");worker.process(id);
  assertNotEquals(originalFile,reads.get(id).latestFileId());assertEquals("IDENTITY_DIFFERENCE",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());
 }
 @Test void processingRefundDoesNotBecomeARefundPayment() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");var pending=order(f,"REFUND",new BigDecimal("20"),pay.id());
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"),row("P"+pay.paymentOrderId(),"R"+pending.id(),"RF-PENDING",new BigDecimal("20"),false,"PROCESSING"));
  Long id=start("pending");worker.process(id);assertEquals(1,payments.count());assertEquals("DIFFERENCE",result(id).status());assertEquals("AWAITING_CONFIRMATION",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());assertEquals(0,BigDecimal.ZERO.compareTo(result(id).finalRefunds()));
 }
 @Test void differencesNeedAnotherReviewerAndNeverChangeTheMatchResult() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("99"),true,"SUCCESS"));
  Long id=start("difference");worker.process(id);var b=result(id);var item=reads.items(b.id(),true,0,25).content().getFirst();assertEquals("AMOUNT_DIFFERENCE",item.comparisonResult());
  disposition.propose(item.id(),item.revision(),"propose","渠道金额异常，申请有依据的例外核查");var saved=items.findById(item.id()).orElseThrow();assertThrows(com.rhn.shared.api.BusinessException.class,()->disposition.review(item.id(),saved.revision(),"self-review","本人复核",true));
  when(contexts.requireCurrent()).thenReturn(manager(362387869790223L));disposition.review(item.id(),saved.revision(),"peer-review","财务复核同意保留异常，不调整资金",true);
  disposition.close(b.id(),b.revision(),"close","保留账单差异带例外结案");assertEquals("DIFFERENCE",result(id).status());assertEquals("CLOSED_WITH_EXCEPTION",result(id).closure());assertEquals(1,payments.count());
  disposition.review(item.id(),saved.revision(),"peer-review","财务复核同意保留异常，不调整资金",true);disposition.close(b.id(),b.revision(),"close","保留账单差异带例外结案");
 }
 @Test void missingPermissionsAndDifferentOrganizationsCannotReadOrProcessMerchantBills() throws Exception {
  Long id=start("access");worker.process(id);
  when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,user,"doctor","test",Set.of(),org,dept,"ORGANIZATION",Set.of(org),Set.of(dept)));
  mockMvc.perform(get("/api/billing/reconciliation/tasks/"+id).with(rhnWorkContext())).andExpect(status().isForbidden());
  mockMvc.perform(post("/api/billing/reconciliation/tasks").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"paymentMethodCode\":\"WECHAT\",\"businessDate\":\""+day+"\",\"commandCode\":\"forbidden\"}")).andExpect(status().isForbidden());
 }
 @Test void changedInputsForOneCommandAreRejectedAndReadResponsesContainNoRawFiles() throws Exception {
  Long id=start("wire");worker.process(id);String response=mockMvc.perform(get("/api/billing/reconciliation/tasks/"+id).with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();assertFalse(response.contains("fixture-version"));assertFalse(response.contains("enc:v1"));
  mockMvc.perform(post("/api/billing/reconciliation/tasks/"+id+"/retry").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"commandCode\":\"missing-version\"}")).andExpect(status().isBadRequest());
 }
 @Test void automaticPolicyPullRunsWithoutAHumanContextAndDoesNotRequeueTheSameDailyRefresh(){
  gateway.availableAfter="00:00";var policy=policies.get("WECHAT");policies.save("WECHAT",policy.revision(),true,"00:00",1);
  when(contexts.requireCurrent()).thenThrow(new IllegalStateException("后台没有操作员上下文"));
  worker.schedule();worker.processDue(5);worker.schedule();worker.processDue(5);
  doReturn(manager(user)).when(contexts).requireCurrent();
  var result=reads.list("WECHAT",day,day,"COMPLETED",0,25);assertEquals(1,result.totalElements());assertEquals(1,gateway.calls);assertTrue(policies.get("WECHAT").autoEnabled());assertNull(policies.get("WECHAT").scheduleError());
 }
 @Test void corruptStatementsRetainQuarantinedEvidenceAndNeverReplaceThePublishedResult(){
  Long id=start("quarantine");worker.process(id);Long published=reads.get(id).latestFileId();gateway.version="broken";gateway.failParse=true;
  var task=tasks.findById(id).orElseThrow();commands.retry(id,task.revision(),"quarantine-retry");worker.process(id);
  assertEquals("FAILED",reads.get(id).status());assertEquals(published,reads.get(id).latestFileId());
  var detail=reads.detail(id);assertEquals(2,detail.files().size());assertFalse(detail.files().getFirst().validated());
  assertEquals(detail.files().getFirst().id(),detail.attempts().getFirst().fileId());assertEquals(1,detail.versions().size());
 }
 @Test void duplicateRowsCannotBecomeTwoMatchedTransactions() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"),row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"));
  Long id=start("duplicate-rows");worker.process(id);assertEquals(2,result(id).differenceCount());assertTrue(reads.items(result(id).id(),true,0,25).content().stream().allMatch(x->x.comparisonResult().equals("DUPLICATE")));assertEquals(1,payments.count());
 }
 @Test void refundMustReferenceTheExactOriginalMerchantOrder() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");var refund=fund(f,"REFUND",new BigDecimal("20"),pay,at,"RF-1");
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"),row("P999999999","R"+refund.paymentOrderId(),"RF-1",new BigDecimal("20"),true,"SUCCESS"));
  Long id=start("wrong-original-order");worker.process(id);assertEquals("IDENTITY_DIFFERENCE",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());assertEquals(2,payments.count());
 }
 @Test void completedMoneyWithAFailedInstructionIsNotMatched() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");
  jdbc.update("update RHN_BIL_PAY_ORDER set SD_STATUS='FAILED' where ID_PAY_ORDER=?",pay.paymentOrderId());
  gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"));Long id=start("instruction-status");worker.process(id);
  assertEquals("STATUS_DIFFERENCE",reads.items(result(id).id(),true,0,25).content().getFirst().comparisonResult());assertEquals(1,payments.count());
 }
 @Test void oneChannelTransactionCannotMatchDifferentMerchantOrders() throws Exception {
  var f=fixture();var paid=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");var other=order(f,"PAYMENT",new BigDecimal("100"),null);
  gateway.lines=List.of(row("P"+paid.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"),row("P"+other.id(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS"));
  Long id=start("duplicate-channel-id");worker.process(id);assertEquals(2,result(id).differenceCount());assertTrue(reads.items(result(id).id(),true,0,25).content().stream().allMatch(item->item.comparisonResult().equals("DUPLICATE")));assertEquals(1,payments.count());
 }
 @Test void lateLocalPostingIsMatchedOnItsChannelDayAndExcludedFromTheNextLocalDay() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");var original=row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("100"),true,"SUCCESS");
  gateway.lines=List.of(new StatementRow(1,original.transactionType(),original.merchantOrderNo(),original.externalTransactionNo(),null,null,null,original.amount(),original.settlementAmount(),original.fee(),"CNY","SUCCESS",true,at.minusSeconds(86400),"MERCHANT","APP"));
  Long previous=commands.enqueue("WECHAT",day.minusDays(1),"late-post").id();worker.process(previous);assertEquals("TIME_DIFFERENCE",reads.items(result(previous).id(),false,0,25).content().getFirst().comparisonResult());
  gateway.lines=List.of();gateway.version="next-day";Long next=start("next-day");worker.process(next);assertEquals("MATCHED",result(next).status());assertEquals(0,result(next).localCount());
 }
 @Test void originalQueryCommandIsReplayedWithoutNewFinancialFacts() throws Exception {
  var f=fixture();var pay=fund(f,"PAYMENT",new BigDecimal("100"),null,at,"T-PAY");gateway.lines=List.of(row("P"+pay.paymentOrderId(),null,"T-PAY",new BigDecimal("99"),true,"SUCCESS"));Long id=start("query");worker.process(id);var item=reads.items(result(id).id(),true,0,25).content().getFirst();
  var first=disposition.query(item.id(),item.revision(),"query-once");var second=disposition.query(item.id(),item.revision(),"query-once");assertEquals(first,second);assertEquals(1,payments.count());assertEquals(1,reads.events(item.id()).stream().filter(e->e.eventType().equals("QUERY")).count());
 }
 @Test void expiredLeaseCannotPublishAfterANewerClaim(){
  var task=new ReconciliationTask(tenant,org,"WECHAT","WECHAT_DIRECT","f".repeat(64),"MERCHANT","TEST","APP",day,"CNY",user,"lease");
  var now=Instant.now();assertTrue(task.claim(now));long first=task.claimToken();assertFalse(task.claim(now.plusSeconds(1)));assertTrue(task.claim(now.plusSeconds(301)));assertFalse(task.owns(first));assertTrue(task.owns(task.claimToken()));
 }
 Fixture fixture()throws Exception{
  var resident=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"fullName\":\"对账测试患者\",\"gender\":\"2\",\"birthDate\":\"1992-03-03\"}")).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
  var account=accounts.saveAndFlush(PatientAccount.registration(tenant,resident,org,dept,"CNY"));var invoice=invoices.saveAndFlush(new Invoice(tenant,org,dept,account.id(),"TEST-"+GlobalIds.next(),"CNY",new BigDecimal("100"),at,user));return new Fixture(account,invoice);
 }
 PaymentOrder order(Fixture f,String type,BigDecimal amount,Long original){return orders.saveAndFlush(new PaymentOrder(tenant,org,dept,f.account.id(),f.invoice.id(),original,"TEST-"+GlobalIds.next(),"KEY-"+GlobalIds.next(),"OUTPATIENT","CASHIER","WECHAT","微信支付",type.equals("PAYMENT")?"SETTLEMENT_PAY":"REFUND",amount,"CNY","test","TEST-TERMINAL",null,user));}
 Payment fund(Fixture f,String type,BigDecimal amount,Payment original,Instant paidAt,String txn){var o=order(f,type,amount,original==null?null:original.id());if(type.equals("PAYMENT"))o.transition("SUCCEEDED",amount,"P"+o.id(),null,null);else o.transitionRefund("REFUNDED",amount,"R"+o.id(),null,null);orders.saveAndFlush(o);var p=payments.saveAndFlush(new Payment(tenant,org,dept,f.account.id(),f.invoice.id(),o.id(),"PAY-"+GlobalIds.next(),type,"WECHAT","CASHIER",amount,"CNY",paidAt,txn,original==null?null:original.id(),user,"test"));ledger.saveAndFlush(new LedgerEntry(tenant,f.account.id(),type.equals("PAYMENT")?"PAYMENT":"PAYMENT_REFUND",type.equals("PAYMENT")?"CREDIT":"DEBIT",amount,"CNY",null,f.invoice.id(),p.id(),null,paidAt,user));return p;}
 int lineCounter;
 StatementRow row(String order,String refund,String txn,BigDecimal amount,boolean success,String state){return new StatementRow(++lineCounter,refund==null?"PAYMENT":"REFUND",order,refund==null?txn:"T-PAY",refund,refund==null?null:txn,refund==null?null:"T-PAY",amount,amount,BigDecimal.ZERO,"CNY",state,success,at,"MERCHANT","APP");}
 record Fixture(PatientAccount account,Invoice invoice){}
 @TestConfiguration(proxyBeanMethods=false) static class Gateways {
  @Bean Gateway reconciliationGateway(){return new Gateway();}
  @Bean PaymentChannelAdapter fakeReconciliationPayment(){return new PaymentChannelAdapter(){public Set<String>paymentMethods(){return Set.of("WECHAT");}public PaymentChannelCapabilities capabilities(String method){return new PaymentChannelCapabilities("WECHAT_DIRECT",PaymentChannelCapabilities.PaymentInteraction.DIRECT,null,true,true,false);}public InitiationResult initiate(PaymentInstruction in){throw new UnsupportedOperationException();}public RefundResult refund(RefundInstruction in){throw new UnsupportedOperationException();}public QueryResult query(QueryInstruction in){return QueryResult.pending(in.externalOrderNo());}};}
 }
 static class Gateway implements ReconciliationAdapter {
  FetchState state=FetchState.AVAILABLE;List<StatementRow>lines=List.of();String version="1";int calls;boolean failParse;String availableAfter="10:00";
  public StatementCapability statementCapability(){return new StatementCapability("WECHAT","WECHAT_DIRECT","测试渠道","TRADE","Asia/Shanghai",availableAfter,90,"TEST-1");}
  public MerchantScope merchantScope(Long tenant,Long org){return new MerchantScope("f".repeat(64),"MERCHANT","TEST","APP");}
  public StatementDownload download(StatementRequest request){calls++;return new StatementDownload(state,state==FetchState.AVAILABLE?List.of(new StatementFile("test.csv",("fixture-version-"+version).getBytes(java.nio.charset.StandardCharsets.UTF_8))):List.of(),"TEST_AUTHENTICATED");}
  public ParsedStatement parse(StatementRequest request,StatementDownload download){if(failParse)throw new StatementProtocolException("测试账单校验失败");BigDecimal p=lines.stream().filter(x->x.transactionType().equals("PAYMENT")).map(StatementRow::amount).reduce(BigDecimal.ZERO,BigDecimal::add);BigDecimal r=lines.stream().filter(x->!x.transactionType().equals("PAYMENT")).map(StatementRow::amount).reduce(BigDecimal.ZERO,BigDecimal::add);return new ParsedStatement(lines,new StatementSummary(lines.size(),p,r,p,r,BigDecimal.ZERO),"TEST-1");}
 }
}
