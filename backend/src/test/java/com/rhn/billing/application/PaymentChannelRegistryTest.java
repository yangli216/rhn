package com.rhn.billing.application;

import com.rhn.billing.api.PaymentChannelAdapter;
import com.rhn.billing.api.PaymentChannelCapabilities;
import com.rhn.billing.api.PaymentChannelCapabilities.PaymentAuthorizationCodeRule;
import com.rhn.billing.api.PaymentChannelCapabilities.PaymentInteraction;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class PaymentChannelRegistryTest {
    record TestAdapter(Set<String> paymentMethods, PaymentChannelCapabilities declaration) implements PaymentChannelAdapter {
        @Override public PaymentChannelCapabilities capabilities(String method) { return declaration; }
        @Override public boolean configured(Long tenant, Long organization) { return Long.valueOf(1).equals(tenant) && Long.valueOf(2).equals(organization); }
        @Override public InitiationResult initiate(PaymentInstruction in) { return InitiationResult.pending(in.orderNo()); }
        @Override public RefundResult refund(RefundInstruction in) { return RefundResult.pending(in.orderNo()); }
        @Override public QueryResult query(QueryInstruction in) { return QueryResult.pending(in.orderNo()); }
    }
    TestAdapter adapter(String code, String method) {
        return new TestAdapter(Set.of(method), new PaymentChannelCapabilities(code, PaymentInteraction.AUTHORIZATION_CODE,
                new PaymentAuthorizationCodeRule("[A-Z0-9]{8}",8,8),true,true,true));
    }
    @Test void aNewProviderIsDiscoveredWithoutChangingRegistryOrBusinessBranches() {
        var provider=adapter("NEW_PROVIDER","NEW_BARCODE");
        var registry=new PaymentChannelRegistry(List.of(new CashPaymentChannelAdapter(),provider),false);
        assertSame(provider,registry.resolve("new_barcode"));
        var view=registry.describe("NEW_BARCODE",1L,2L);
        assertTrue(view.available());assertEquals("NEW_PROVIDER",view.capabilities().adapterCode());
        assertDoesNotThrow(()->view.capabilities().validateAuthorizationCode("ABC12345"));
        assertThrows(BusinessException.class,()->view.capabilities().validateAuthorizationCode("134567890123456789"));
    }
    @Test void overlappingMethodsFailBeforeAnOrderCanBeCreatedRegardlessOfBeanOrder() {
        for(boolean reverse:List.of(false,true)) {
            var first=adapter("ONE","METHOD");var second=adapter("TWO","METHOD");
            var failure=assertThrows(BusinessException.class,()->new PaymentChannelRegistry(reverse?List.of(second,first):List.of(first,second),false));
            assertEquals("PAYMENT_CHANNEL_ROUTE_AMBIGUOUS",failure.code());
        }
    }
    @Test void duplicateProviderIdentifiersAndEmptyDeclarationsFailAtRegistration() {
        assertEquals("PAYMENT_CHANNEL_ID_DUPLICATED",assertThrows(BusinessException.class,
                ()->new PaymentChannelRegistry(List.of(adapter("SAME","ONE"),adapter("SAME","TWO")),false)).code());
        assertThrows(BusinessException.class,()->new PaymentChannelRegistry(List.of(new TestAdapter(Set.of(),adapter("X","X").declaration())),false));
    }
    @Test void aMissingRouteFailsClosedAndMessageHandoffRequiresExplicitOptIn() {
        assertEquals("PAYMENT_CHANNEL_NOT_CONFIGURED",assertThrows(BusinessException.class,
                ()->new PaymentChannelRegistry(List.of(),false).resolve("MISSING")).code());
        assertNull(new PaymentChannelRegistry(List.of(),true).resolve("MISSING"));
        assertFalse(new PaymentChannelRegistry(List.of(),true).describe("MISSING",1L,2L).available());
    }
    @Test void merchantReadinessIsInstitutionScopedAndNeverAdvertisesSecrets() {
        var registry=new PaymentChannelRegistry(List.of(adapter("NEW","METHOD")),false);
        assertFalse(registry.describe("METHOD",2L,2L).available());
        assertFalse(registry.describe("METHOD",1L,3L).available());
        assertFalse(registry.describe("METHOD",1L,null).available());
    }
    @Test void capabilityDeclarationsCannotSilentlyAcceptMissingRulesOrUnsafeCancellation() {
        assertThrows(IllegalArgumentException.class,()->new PaymentChannelCapabilities("X",PaymentInteraction.AUTHORIZATION_CODE,null,true,true,true));
        assertThrows(IllegalArgumentException.class,()->new PaymentChannelCapabilities("X",PaymentInteraction.DIRECT,null,false,true,true));
        assertThrows(IllegalArgumentException.class,()->new PaymentAuthorizationCodeRule("[0-9]",0,100));
        assertThrows(BusinessException.class,()->new CashPaymentChannelAdapter().capabilities("CASH").validateAuthorizationCode("secret"));
    }
}
