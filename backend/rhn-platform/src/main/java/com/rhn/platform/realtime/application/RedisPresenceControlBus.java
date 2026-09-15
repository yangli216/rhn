package com.rhn.platform.realtime.application;

import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "redis")
class RedisPresenceControlBus implements PresenceControlPublisher, MessageListener {
    private static final Logger log = LoggerFactory.getLogger(RedisPresenceControlBus.class);
    private final StringRedisTemplate redis;
    private final JsonCodec jsonCodec;
    private final ApplicationEventPublisher events;
    private final String topic;

    RedisPresenceControlBus(StringRedisTemplate redis, JsonCodec jsonCodec, ApplicationEventPublisher events,
                            @Value("${rhn.presence.redis-control-topic:rhn:presence:controls}") String topic) {
        this.redis = redis; this.jsonCodec = jsonCodec; this.events = events; this.topic = topic;
    }

    @Override public void publish(PresenceControlCommand command) {
        redis.convertAndSend(topic, jsonCodec.write(command));
    }

    @Override public void onMessage(Message message, byte[] pattern) {
        try {
            events.publishEvent(jsonCodec.read(new String(message.getBody(), StandardCharsets.UTF_8),
                    PresenceControlCommand.class));
        } catch (RuntimeException error) {
            log.warn("Ignoring malformed presence control message", error);
        }
    }
}
