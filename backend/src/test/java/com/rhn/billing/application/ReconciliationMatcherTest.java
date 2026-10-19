package com.rhn.billing.application;

import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.reconciliation.ReconciliationMatcher;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ReconciliationMatcherTest {
    StatementRow reversal(String order){return new StatementRow(1,"REVERSAL",order,"TXN","0","0","TXN",BigDecimal.TEN,BigDecimal.TEN,BigDecimal.ZERO,"CNY","SUCCESS",true,Instant.now(),"MERCHANT","APP");}
    @Test void reversalIdentityUsesTheOriginalOrderInsteadOfAPlaceholderRefundRequest(){var a=reversal("P10");var b=reversal("P11");assertEquals(10L,ReconciliationMatcher.orderId(a));assertNotEquals(ReconciliationMatcher.key(a),ReconciliationMatcher.key(b));}
    @Test void reversalAlwaysNeedsExplicitReviewAndNeverBecomesAnAutomaticRefund(){assertEquals("REVERSAL_REVIEW",ReconciliationMatcher.match(reversal("P10"),null,List.of(),List.of(),true,false,ZoneId.of("Asia/Shanghai")).type());}
    @Test void untrustedOrOverflowingMerchantIdentifiersDoNotGuessAnOrder(){assertNull(ReconciliationMatcher.orderId(reversal("10")));assertNull(ReconciliationMatcher.orderId(reversal("P9999999999999999999")));assertNull(ReconciliationMatcher.orderId(reversal("R10")));}
}
