package com.rhn.platform.realtime.application;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Set;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisPresenceControlBusTest {
    @Test
    void distributes_session_termination_commands_between_instances() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        TestJsonCodec json = new TestJsonCodec();
        RedisPresenceControlBus bus = new RedisPresenceControlBus(redis, json, events, "presence:controls");
        PresenceControlCommand command = new PresenceControlCommand(10L, 20L, Set.of("session-123"),
                "异常登录", 30L, Instant.now());

        bus.publish(command);
        verify(redis).convertAndSend(org.mockito.ArgumentMatchers.eq("presence:controls"),
                argThat(payload -> payload instanceof String text && text.contains("session-123")));

        Message message = mock(Message.class);
        when(message.getBody()).thenReturn(json.write(command).getBytes(StandardCharsets.UTF_8));
        bus.onMessage(message, null);
        verify(events).publishEvent(command);
    }
}
