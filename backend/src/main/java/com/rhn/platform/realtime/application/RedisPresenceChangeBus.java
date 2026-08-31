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
public class RedisPresenceChangeBus implements PresenceChangePublisher, MessageListener {
    private static final Logger log = LoggerFactory.getLogger(RedisPresenceChangeBus.class);
    private final StringRedisTemplate redis;
    private final JsonCodec jsonCodec;
    private final ApplicationEventPublisher events;
    private final String topic;

    public RedisPresenceChangeBus(StringRedisTemplate redis, JsonCodec jsonCodec,
                                  ApplicationEventPublisher events,
                                  @Value("${rhn.presence.redis-change-topic:rhn:presence:changes}") String topic) {
        this.redis = redis;
        this.jsonCodec = jsonCodec;
        this.events = events;
        this.topic = topic;
    }

    @Override
    public void publish(PresenceChanged change) {
        redis.convertAndSend(topic, jsonCodec.write(change));
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            PresenceChanged change = jsonCodec.read(
                    new String(message.getBody(), StandardCharsets.UTF_8), PresenceChanged.class);
            events.publishEvent(change);
        } catch (RuntimeException error) {
            log.warn("Ignoring malformed presence change message", error);
        }
    }
}
