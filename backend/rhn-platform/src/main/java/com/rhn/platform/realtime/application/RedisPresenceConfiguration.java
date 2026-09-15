package com.rhn.platform.realtime.application;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "rhn.presence.store", havingValue = "redis")
public class RedisPresenceConfiguration {
    @Bean
    RedisMessageListenerContainer presenceRedisMessageListenerContainer(
            RedisConnectionFactory connectionFactory, RedisPresenceChangeBus bus,
            RedisPresenceControlBus controlBus,
            @Value("${rhn.presence.redis-change-topic:rhn:presence:changes}") String topic,
            @Value("${rhn.presence.redis-control-topic:rhn:presence:controls}") String controlTopic) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(bus, new ChannelTopic(topic));
        container.addMessageListener(controlBus, new ChannelTopic(controlTopic));
        return container;
    }
}
