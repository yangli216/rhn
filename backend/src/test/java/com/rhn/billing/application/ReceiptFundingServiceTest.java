package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReceiptFundingServiceTest {
    final SettlementTenderRepository tenders = mock(SettlementTenderRepository.class);
    final PaymentRepository payments = mock(PaymentRepository.class);
    final InsuranceClaimRepository claims = mock(InsuranceClaimRepository.class);
    final InsuranceClaimResponseRepository responses = mock(InsuranceClaimResponseRepository.class);
    final ReceiptFundingService service = new ReceiptFundingService(tenders, payments, claims, responses);
    final Settlement settlement = new Settlement(2L, 1L, 3L, 4L, "STL", "CMD", "NORMAL", "OUTPATIENT",
            "CASHIER", money("10"), "CNY", "TEST", 5L, Instant.now());
    final List<SettlementTender> rows = new ArrayList<>();
    ReceiptFundingServiceTest() {
        when(tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(1L, 2L)).thenReturn(rows);
        when(claims.findByTenantIdAndSettlementId(1L, 2L)).thenReturn(Optional.empty());
    }
    @Test void reportsFourDistinctSourcesWithoutDoubleCountingPersonalAccount() {
        insurance("SETTLE", "5", "1", "2", "2"); payment("2", "CASH", false, "2"); finish();
        var result=service.resolve(settlement);
        equal("5",result.insuranceAmount()); equal("1",result.personalAccountAmount());
        equal("2",result.patientAmount()); equal("2",result.otherFundAmount());
    }
    @Test void selfPayZeroInsuranceIsDerivedFromCompletedPayment() {
        payment("10","CASH",false,"10");finish();var result=service.resolve(settlement);
        equal("10",result.patientAmount());equal("0",result.insuranceAmount());equal("0",result.personalAccountAmount());equal("0",result.otherFundAmount());
    }
    @Test void supportsFullyFundedSettlementWithoutInventingAPatientPayment() {
        insurance("SETTLE","5","3","0","2");finish();equal("0",service.resolve(settlement).patientAmount());
    }
    @Test void legacyInsuranceAmountsCannotBecomeConfirmedFiscalFunding() {
        var response=insurance("SETTLE","5","1","2","2");payment("2","CASH",false,"2");finish();
        ReflectionTestUtils.setField(response,"amountSource","LEGACY_UNVERIFIED");rejected();
    }
    @Test void missingPaymentCannotBeFilledWithSettlementPatientAmount() {
        insurance("SETTLE","5","1","2","2");finish();rejected();
    }
    @Test void missingInsuranceSourceCannotBeFilledWithAggregateAmounts() {
        insurance("SETTLE","5","1","2","2");payment("2","CASH",false,"2");finish();
        when(claims.findByTenantIdAndSettlementId(1L,2L)).thenReturn(Optional.empty());rejected();
    }
    @Test void wrongSourceSplitIsRejectedEvenWhenTotalAndSettlementAggregatesMatch() {
        var response=insurance("SETTLE","5","1","2","2");payment("2","CASH",false,"2");finish();
        ReflectionTestUtils.setField(response,"personalAccountAmount",money("2"));
        ReflectionTestUtils.setField(response,"patientCashAmount",money("1"));rejected();
    }
    @Test void duplicateInsuranceCategoryCannotBeSummedIntoAnApparentlyValidTotal() {
        insurance("SETTLE","5","1","2","2");payment("2","CASH",false,"2");finish();rows.add(rows.getFirst());rejected();
    }
    @Test void partialPrepaymentUsesAppliedAmountInsteadOfWholeDeposit() {
        payment("100","CASH",true,"10");finish();equal("10",service.resolve(settlement).patientAmount());
    }
    @Test void refundedPaymentCannotSupportOriginalReceipt() {
        var payment=payment("10","CASH",false,"10");finish();
        when(payments.refundedForPayment(1L,payment.id())).thenReturn(money("1"));rejected();
    }
    @Test void foreignAccountCurrencyAndInvoiceAreRejected() {
        var payment=payment("10","CASH",false,"10");finish();
        for(String field:List.of("patientAccountId","invoiceId","organizationId")) {
            Object before=ReflectionTestUtils.getField(payment,field);ReflectionTestUtils.setField(payment,field,999L);rejected();ReflectionTestUtils.setField(payment,field,before);
        }
        ReflectionTestUtils.setField(payment,"currencyCode","USD");rejected();
    }
    @Test void unknownOrMisclassifiedPaymentDoesNotBecomePatientCash() {
        var payment=payment("10","CASH",false,"10");finish();
        ReflectionTestUtils.setField(payment,"paymentMethodCode","UNKNOWN");rejected();
        ReflectionTestUtils.setField(payment,"paymentMethodCode","MEDICAL_INSURANCE");rejected();
    }
    @Test void reportedReversalCancelsInsuranceTendersBeforeCashReplacement() {
        var first=insurance("SETTLE","5","1","2","2");
        var second=insurance("REVERSE","5","1","2","2");
        var claim=claims.findByTenantIdAndSettlementId(1L,2L).orElseThrow();
        when(responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(1L,claim.id())).thenReturn(List.of(first,second));
        finish();settlement.reverseInsuranceAllocation();payment("10","CASH",false,"10");finish();
        var result=service.resolve(settlement);equal("0",result.insuranceAmount());equal("0",result.personalAccountAmount());equal("0",result.otherFundAmount());equal("10",result.patientAmount());
    }
    @Test void pendingOrPreSettlementResponseCannotCertifyFunding() {
        var response=insurance("SETTLE","5","1","2","2");payment("2","CASH",false,"2");finish();
        ReflectionTestUtils.setField(response,"operation","PRE_SETTLE");rejected();
        ReflectionTestUtils.setField(response,"operation","SETTLE");ReflectionTestUtils.setField(response,"status","PENDING");rejected();
    }
    @Test void duplicateOrMissingPaymentLinkIsRejected() {
        payment("10","CASH",false,"10");finish();rows.add(rows.getFirst());rejected();rows.removeLast();
        ReflectionTestUtils.setField(rows.getFirst(),"paymentId",null);rejected();
    }
    void rejected(){assertThrows(BusinessException.class,()->service.resolve(settlement));}
    void finish(){settlement.applyPaidAmount(money("10"),5L,Instant.now());}
    Payment payment(String paid,String method,boolean prepay,String applied) {
        var value=new Payment(1L,3L,prepay?null:4L,null,"PAY","PAYMENT",method,prepay?"INPATIENT_PREPAYMENT":"CASHIER",money(paid),"CNY",Instant.now(),"TXN",null,5L,null);
        when(payments.findByIdAndTenantId(value.id(),1L)).thenReturn(Optional.of(value));
        when(payments.refundedForPayment(1L,value.id())).thenReturn(BigDecimal.ZERO);
        rows.add(new SettlementTender(1L,2L,value.id(),rows.size()+1,prepay?"PREPAYMENT":"CASH",method,null,money(applied),"CNY"));return value;
    }
    InsuranceClaimResponse insurance(String operation,String fund,String personal,String patient,String other) {
        var claim=claims.findByTenantIdAndSettlementId(1L,2L).orElseGet(()->new InsuranceClaim(1L,2L,3L,7L,"CLAIM","REGION","TYPE","PAYER","ORG","DEPT","DOC","DIGEST",Instant.now(),null,money("10"),"CNY","CORR",5L));
        when(claims.findByTenantIdAndSettlementId(1L,2L)).thenReturn(Optional.of(claim));
        var response=new InsuranceClaimResponse(1L,claim.id(),null,"CMD"+rows.size(),operation,new InsuranceResult(InsuranceResult.Outcome.SUCCEEDED,"EXT","MSG"+rows.size(),money(fund),money(personal),money(patient),money(other),"CNY",null,null,null));
        when(responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(1L,claim.id())).thenReturn(List.of(response));
        if(operation.equals("SETTLE")) settlement.applyInsuranceAllocation(money(fund),money(personal),money(patient),money(other));
        var amounts=Map.of("INSURANCE_FUND",fund,"PERSONAL_ACCOUNT",personal,"SUBSIDY",other);
        amounts.forEach((type,amount)->{if(money(amount).signum()>0)rows.add(new SettlementTender(1L,2L,response.id(),rows.size()+1,type,"PAYER",null,operation.equals("REVERSE")?money(amount).negate():money(amount),"CNY",true));});
        return response;
    }
    static BigDecimal money(String value){return new BigDecimal(value);}
    static void equal(String value,BigDecimal actual){assertEquals(0,money(value).compareTo(actual));}
}
