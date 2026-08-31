package com.rhn.platform.realtime.application;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RedisPresenceChangeBusTest {
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final TestJsonCodec jsonCodec = new TestJsonCodec();
    private final RedisPresenceChangeBus bus = new RedisPresenceChangeBus(
            redis, jsonCodec, events, "rhn:presence:changes");

    @Test
    void publishes_changes_to_redis_and_delivers_messages_to_the_local_application() {
        PresenceChanged change = new PresenceChanged(10L, 20L, 30L, "CONNECTED", Instant.now());

        bus.publish(change);
        verify(redis).convertAndSend(org.mockito.ArgumentMatchers.eq("rhn:presence:changes"),
                argThat(payload -> payload instanceof String text && text.contains("CONNECTED")
                        && text.contains("\"tenantId\":10")));

        Message message = mock(Message.class);
        when(message.getBody()).thenReturn(jsonCodec.write(change).getBytes(StandardCharsets.UTF_8));
        bus.onMessage(message, null);

        verify(events).publishEvent(change);
    }
}
