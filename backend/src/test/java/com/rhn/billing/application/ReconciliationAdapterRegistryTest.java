package com.rhn.billing.application;

import com.rhn.billing.api.*;
import com.rhn.billing.api.PaymentReconciliation.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReconciliationAdapterRegistryTest {
    PaymentChannelRegistry payments(){var registry=mock(PaymentChannelRegistry.class);var adapter=mock(PaymentChannelAdapter.class);when(registry.resolve("NEW_METHOD")).thenReturn(adapter);when(adapter.capabilities("NEW_METHOD")).thenReturn(new PaymentChannelCapabilities("NEW_ADAPTER",PaymentChannelCapabilities.PaymentInteraction.DIRECT,null,true,true,false));return registry;}
    ReconciliationAdapter declared(String method,String owner){return new ReconciliationAdapter(){public StatementCapability statementCapability(){return new StatementCapability(method,owner,"新增渠道","TRADE","Asia/Shanghai","10:00",90,"NEW-1");}};}
    @Test void newStatementProviderNeedsOnlyItsDeclaredAdapterAndPaymentOwner(){var provider=declared("NEW_METHOD","NEW_ADAPTER");var registry=new ReconciliationAdapterRegistry(List.of(provider),payments());assertSame(provider,registry.require("NEW_METHOD"));assertEquals("NEW-1",registry.capabilities().getFirst().parserVersion());}
    @Test void duplicateRoutesFailRegardlessOfBeanOrder(){var a=declared("NEW_METHOD","NEW_ADAPTER");var b=declared("NEW_METHOD","NEW_ADAPTER");for(var list:List.of(List.of(a,b),List.of(b,a)))assertThrows(IllegalArgumentException.class,()->new ReconciliationAdapterRegistry(list,payments()));}
    @Test void foreignOwnersAndNonCanonicalMethodsAreRejected(){assertThrows(IllegalArgumentException.class,()->new ReconciliationAdapterRegistry(List.of(declared("NEW_METHOD","OTHER")),payments()));assertThrows(IllegalArgumentException.class,()->new ReconciliationAdapterRegistry(List.of(declared("new_method","NEW_ADAPTER")),payments()));}
    @Test void legacyPredicateAmbiguityFailsInsteadOfChoosingFirst(){ReconciliationAdapter a=new ReconciliationAdapter(){public boolean supports(String type,String code){return true;}};var registry=new ReconciliationAdapterRegistry(List.of(a,a),payments());assertThrows(com.rhn.shared.api.BusinessException.class,()->registry.legacy("TYPE","SOURCE"));assertThrows(com.rhn.shared.api.BusinessException.class,()->registry.require("MISSING"));}
}
