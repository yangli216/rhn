package com.rhn.platform.integration.application;

import com.rhn.platform.integration.api.ExternalMessageService.*;
import com.rhn.platform.integration.domain.ExternalMessage;
import com.rhn.platform.integration.infrastructure.ExternalMessageRepository;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExternalMessageTruthTest {
    final ExternalMessageRepository repository=mock(ExternalMessageRepository.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final JsonCodec json=mock(JsonCodec.class);
    final Map<List<Object>,ExternalMessage> stored=new HashMap<>();
    ExternalMessageApplicationService service;
    @BeforeEach void setup() {
        TenantContext.set(1L);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"adapter","corr",Set.of(),3L,4L,"ALL",Set.of(5L),Set.of(6L)));
        when(json.write(any())).thenAnswer(c->JsonMapper.builder().build().writeValueAsString(c.getArgument(0)));
        when(repository.findByTenantIdAndEndpointCodeAndDirectionAndBusinessMessageId(anyLong(),anyString(),anyString(),anyString()))
                .thenAnswer(c->Optional.ofNullable(stored.get(List.of(c.getArgument(0),c.getArgument(1),c.getArgument(2),c.getArgument(3)))));
        when(repository.save(any())).thenAnswer(c->{ExternalMessage m=c.getArgument(0);
            stored.put(List.of(m.tenantId(),m.endpointCode(),m.direction(),m.businessMessageId()),m);return m;});
        service=new ExternalMessageApplicationService(repository,json,contexts);
    }
    @AfterEach void cleanup() { TenantContext.clear(); }
    InboundMessage inbound(String type,Long org,Long dept,Object payload) {
        return new InboundMessage("ENDPOINT",type,"MSG","corr",org,dept,payload);
    }
    @Test void inboundReplayChecksTypeAndScopeEvenWhenBothScopesAreAuthorized() {
        var original=service.receiveInbound(inbound("RESULT",3L,4L,Map.of("amount",10)));
        assertTrue(service.receiveInbound(inbound("RESULT",3L,4L,Map.of("amount",10))).duplicate());
        for(var changed:List.of(inbound("OTHER",3L,4L,Map.of("amount",10)),inbound("RESULT",5L,4L,Map.of("amount",10)),
                inbound("RESULT",3L,6L,Map.of("amount",10)),inbound("RESULT",3L,4L,Map.of("amount",20)))) {
            assertEquals("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT",assertThrows(BusinessException.class,()->service.receiveInbound(changed)).code());
        }
        assertEquals(original.id(),stored.values().iterator().next().id()); assertEquals(1,stored.size());
    }
    @Test void callerCannotReplayAnInaccessibleStoredMessageThroughItsOwnScope() {
        service.receiveInbound(inbound("RESULT",5L,6L,Map.of("ok",true)));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"adapter","corr",Set.of(),3L,4L,"SELF",Set.of(),Set.of()));
        assertEquals("INTEGRATION_SCOPE_FORBIDDEN",assertThrows(BusinessException.class,
                ()->service.receiveInbound(inbound("RESULT",3L,4L,Map.of("ok",true)))).code());
    }
    @Test void normalizedMessageIdentityReplaysInsteadOfHittingAUniqueConstraint() {
        var first=service.receiveInbound(inbound("RESULT",3L,4L,Map.of("ok",true)));
        var again=service.receiveInbound(new InboundMessage(" ENDPOINT "," RESULT "," MSG ","new-correlation",3L,4L,Map.of("ok",true)));
        assertTrue(again.duplicate()); assertEquals(first.id(),again.id()); assertEquals(1,stored.size());
    }
    @ParameterizedTest @ValueSource(strings={"type","org","dept","resourceType","resourceId","revision","payload"})
    void outboundReplayCannotBorrowAnotherResourcesReceipt(String field) {
        var original=new OutboundMessage("ENDPOINT","ORDER","MSG","corr",3L,4L,Map.of("ok",true),"Order",10L,1L);
        service.enqueueOutbound(original);
        var changed=new OutboundMessage("ENDPOINT",field.equals("type")?"OTHER":"ORDER","MSG","new-correlation",
                field.equals("org")?5L:3L,field.equals("dept")?6L:4L,Map.of("ok",!field.equals("payload")),
                field.equals("resourceType")?"Other":"Order",field.equals("resourceId")?11L:10L,field.equals("revision")?2L:1L);
        assertEquals("EXTERNAL_MESSAGE_IDEMPOTENCY_CONFLICT",assertThrows(BusinessException.class,()->service.enqueueOutbound(changed)).code());
        assertTrue(service.enqueueOutbound(original).duplicate()); assertEquals(1,stored.size());
    }
}
