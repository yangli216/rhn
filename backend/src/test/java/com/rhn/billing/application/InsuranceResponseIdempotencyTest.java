package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceSettlementAdapter;
import com.rhn.billing.api.InsuranceSettlementAdapter.*;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceResponseIdempotencyTest {
    final InsuranceClaimRepository claims=mock(InsuranceClaimRepository.class);
    final InsuranceClaimResponseRepository responses=mock(InsuranceClaimResponseRepository.class);
    final PatientAccountRepository accounts=mock(PatientAccountRepository.class);
    final SettlementApplicationService accounting=mock(SettlementApplicationService.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final InsuranceClaim claim=new InsuranceClaim(1L,2L,3L,4L,"KEY","REGION","BASIC","payer","H","D","P","HASH",
            Instant.parse("2026-10-04T01:00:00Z"),null,n("100"),"CNY","corr",5L);
    final List<InsuranceClaimResponse> stored=new ArrayList<>();
    InsuranceClaimTransactionService service;
    static BigDecimal n(String value) { return new BigDecimal(value); }
    static InsuranceResult success(String number) { return new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,number,null,
            n("60"),n("20"),n("10"),n("10"),"CNY",null,null,null); }
    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,5L,"cashier","corr",Set.of(),6L,7L,"SELF",Set.of(),Set.of()));
        when(claims.lockByIdAndTenantId(claim.id(),1L)).thenReturn(Optional.of(claim));
        var account=mock(PatientAccount.class); when(account.organizationId()).thenReturn(6L);
        when(accounts.findByIdAndTenantId(3L,1L)).thenReturn(Optional.of(account));
        when(responses.findByTenantIdAndClaimIdAndCommandCode(eq(1L),eq(claim.id()),anyString())).thenAnswer(c ->
                stored.stream().filter(r->r.commandCode().equals(c.getArgument(2))).findFirst());
        when(responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(1L,claim.id())).thenAnswer(c->List.copyOf(stored));
        when(responses.findByTenantIdAndClaimIdAndResponseNo(eq(1L),eq(claim.id()),anyString())).thenAnswer(c ->
                stored.stream().filter(r->r.responseNo().equals(c.getArgument(2))).findFirst());
        when(responses.save(any())).thenAnswer(c->{ InsuranceClaimResponse r=c.getArgument(0); stored.add(r); return r; });
        service=new InsuranceClaimTransactionService(claims,mock(InsuranceClaimLineRepository.class),responses,
                mock(SettlementRepository.class),mock(SettlementLineRepository.class),mock(ChargeItemRepository.class),accounts,
                mock(CoverageDirectory.class),accounting,contexts,mock(JsonCodec.class),mock(InsuranceQuickSubmissionResolver.class),mock(ItemStandardMappingDirectory.class),mock(com.rhn.platform.integration.api.ExternalMessageService.class));
    }
    InsuranceClaimTransactionService.ApplyResult apply(String operation,InsuranceResult result,String command) {
        return service.apply(claim.id(),operation,result,command,null,false);
    }
    void preSettle() { apply("PRE_SETTLE",success("PRE"),"PRE"); }
    void settle() { preSettle(); claim.prepareSettlement(); apply("SETTLE",success("SET"),"SET"); }
    void verifyPostedOnce() {
        verify(accounting,times(1)).recordInsuranceResponse(any(),eq(2L),anyLong(),anyString(),anyString(),any(),any(),any(),any(),any());
    }
    @Test void repeatedSuccessWithDifferentCommandsRecordsDeliveryButPostsOnlyOnce() {
        settle();
        var first=stored.getLast();
        var same=apply("SETTLE",success("SET"),"SET"); assertTrue(same.duplicate()); assertSame(first,same.response());
        var other=apply("SETTLE",success("SET"),"OTHER-DELIVERY"); assertTrue(other.duplicate());
        assertEquals(3,stored.size()); verifyPostedOnce(); assertEquals("SETTLED",claim.status());
    }
    @Test void identicalExternalMessageIsReplayedBeforeTheUniqueConstraintAndConflictingContentIsRejected() {
        preSettle(); claim.prepareSettlement();
        var result=new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"SET","MSG-1",n("60"),n("20"),n("10"),n("10"),"CNY",null,null,null);
        var original=apply("SETTLE",result,"SET");
        var replay=apply("SETTLE",result,"OTHER-COMMAND");
        assertTrue(replay.duplicate()); assertSame(original.response(),replay.response()); assertEquals(2,stored.size());
        var changed=new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"SET","MSG-1",n("70"),n("10"),n("10"),n("10"),"CNY",null,null,null);
        assertEquals("INSURANCE_RESULT_REPLAY_MISMATCH",assertThrows(BusinessException.class,()->apply("SETTLE",changed,"CHANGED")).code());
        assertEquals("INSURANCE_RESULT_REPLAY_MISMATCH",assertThrows(BusinessException.class,()->apply("REVERSE",result,"WRONG-PHASE")).code());
        verifyPostedOnce(); assertEquals(2,stored.size());
    }
    @ParameterizedTest @ValueSource(strings={"operation","outcome","number","fund","personal","patient","other","currency","missing","precision"})
    void sameCommandWithDifferentResultCannotBorrowPriorSuccess(String changed) {
        settle(); var original=success("SET");
        var result=new InsuranceResult(changed.equals("outcome")?InsuranceResult.Outcome.FAILED:original.outcome(),
                changed.equals("number")?"OTHER":"SET",null,
                changed.equals("fund")?n("61"):changed.equals("missing")?null:changed.equals("precision")?n("60.0000001"):n("60"),
                changed.equals("personal")?n("21"):n("20"),changed.equals("patient")?n("11"):n("10"),
                changed.equals("other")?n("11"):n("10"),changed.equals("currency")?"USD":"CNY",null,null,null);
        assertEquals("INSURANCE_RESULT_REPLAY_MISMATCH",assertThrows(BusinessException.class,
                ()->apply(changed.equals("operation")?"REVERSE":"SETTLE",result,"SET")).code());
        assertEquals(2,stored.size()); assertEquals("SETTLED",claim.status()); verifyPostedOnce();
    }
    @Test void changedAllocationWithNewCommandCannotModifyConfirmedAmounts() {
        settle();
        var changed=new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"SET",null,n("70"),n("10"),n("10"),n("10"),"CNY",null,null,null);
        assertThrows(BusinessException.class,()->apply("SETTLE",changed,"CHANGED"));
        assertEquals(0,n("60").compareTo(claim.insuranceFundAmount())); assertEquals(2,stored.size()); verifyPostedOnce();
    }
    @Test void latePendingAndFailureCannotDowngradeConfirmedResult() {
        settle();
        for(var outcome:List.of(InsuranceResult.Outcome.PENDING,InsuranceResult.Outcome.FAILED)) {
            var late=new InsuranceResult(outcome,null,null,null,null,null,null,null,"LATE","旧回执",null);
            assertThrows(BusinessException.class,()->apply("SETTLE",late,outcome.name()));
        }
        assertEquals("SETTLED",claim.status()); assertEquals(2,stored.size()); verifyPostedOnce();
    }
    @Test void reversalRedeliveryCannotPostAgainOrChangeItsExternalReference() {
        settle(); claim.prepareReversal("取消"); apply("REVERSE",success("REV"),"REV");
        var reversedAt=claim.reversedAt();
        assertTrue(apply("REVERSE",success("REV"),"REV-AGAIN").duplicate());
        assertThrows(BusinessException.class,()->apply("REVERSE",success("OTHER-REV"),"CHANGED-REV"));
        assertEquals(reversedAt,claim.reversedAt()); assertEquals("SET",claim.externalSettlementNo());
        verify(accounting,times(1)).recordInsuranceReversal(any(),eq(2L),eq(stored.get(1).id()),anyLong(),anyString(),anyString(),any(),any(),any(),any());
    }
    @Test void zeroFundedSettlementStillConfirmsOnlyOnce() {
        preSettle(); claim.prepareSettlement();
        var zero=new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"SET",null,n("0"),n("0"),n("100"),n("0"),"CNY",null,null,null);
        apply("SETTLE",zero,"SET"); assertTrue(apply("SETTLE",zero,"OTHER").duplicate()); verifyPostedOnce();
    }
    @Test void missingOriginalReceiptCannotBeTreatedAsVerifiedRedelivery() {
        settle(); stored.clear();
        assertEquals("INSURANCE_CONFIRMED_RESPONSE_MISSING",assertThrows(BusinessException.class,()->apply("SETTLE",success("SET"),"OTHER")).code());
        assertTrue(stored.isEmpty()); verifyPostedOnce();
    }
    @Test void queryPersistsTheStageCapturedBeforeTheExternalCall() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var adapter=mock(InsuranceSettlementAdapter.class);
        var app=new InsuranceClaimApplicationService(transactions,List.of(adapter),mock(ExternalMessageService.class),contexts,
                mock(com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient.class));
        var instruction=mock(InsuranceInstruction.class);
        when(instruction.regionCode()).thenReturn("REGION"); when(instruction.insuranceTypeCode()).thenReturn("BASIC");
        when(transactions.instruction(claim.id())).thenReturn(instruction); when(adapter.supports("REGION","BASIC")).thenReturn(true);
        var captured=new InsuranceQuery(claim.id(),claim.claimNo(),"SETTLE","REGION","BASIC","PRE",null,"corr");
        when(transactions.queryInstruction(claim.id())).thenReturn(captured);
        var result=success("SET"); when(adapter.query(captured)).thenReturn(result);
        when(transactions.apply(claim.id(),"SETTLE",result,"QUERY-CHECK",null,false))
                .thenReturn(new InsuranceClaimTransactionService.ApplyResult(claim,null,false));
        app.query(claim.id(),"CHECK");
        verify(transactions).apply(claim.id(),"SETTLE",result,"QUERY-CHECK",null,false);
    }
}
