package com.rhn.platform.numbering.application;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.net.ServerSocket;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;

/** Starts its own Redis on a random port. Never connects to the manual runtime Redis. */
@EnabledIfEnvironmentVariable(named = "RHN_NUMBERING_TEST_REDIS_EXECUTABLE", matches = ".+")
class RedisBusinessNumberCounterIntegrationTest {
    @TempDir static Path directory;
    private static Process server;
    private static LettuceConnectionFactory firstConnection;
    private static LettuceConnectionFactory secondConnection;
    private static StringRedisTemplate first;
    private static StringRedisTemplate second;

    @BeforeAll
    static void startDedicatedRedis() throws Exception {
        int port;
        try (var socket = new ServerSocket(0)) { port = socket.getLocalPort(); }
        server = new ProcessBuilder(System.getenv("RHN_NUMBERING_TEST_REDIS_EXECUTABLE"), "--bind", "127.0.0.1",
                "--port", Integer.toString(port), "--save", "", "--appendonly", "no", "--dir", directory.toString())
                .redirectErrorStream(true).redirectOutput(directory.resolve("redis.log").toFile()).start();
        System.out.println("Numbering test Redis pid=" + server.pid() + " port=" + port);
        firstConnection = connection(port); secondConnection = connection(port);
        first = new StringRedisTemplate(firstConnection); second = new StringRedisTemplate(secondConnection);
        for (int i = 0; i < 50; i++) {
            try { first.execute((org.springframework.data.redis.core.RedisCallback<String>) connection -> connection.ping()); return; }
            catch (RuntimeException notReady) { Thread.sleep(100); }
        }
        stopDedicatedRedis(); throw new IllegalStateException("Dedicated Redis did not start");
    }

    @AfterAll
    static void stopDedicatedRedis() throws Exception {
        if (firstConnection != null) firstConnection.destroy();
        if (secondConnection != null) secondConnection.destroy();
        if (server != null) {
            server.destroy();
            if (!server.waitFor(5, TimeUnit.SECONDS)) { server.destroyForcibly(); assertThat(server.waitFor(5, TimeUnit.SECONDS)).isTrue(); }
            assertThat(server.isAlive()).isFalse();
        }
    }

    @Test
    void concurrent_instances_share_unique_sequences_and_application_recreation_keeps_progress() throws Exception {
        var one = new RedisBusinessNumberCounter(first); var two = new RedisBusinessNumberCounter(second);
        try (var pool = Executors.newFixedThreadPool(12)) {
            var jobs = IntStream.range(0, 400).<java.util.concurrent.Callable<Long>>mapToObj(index ->
                    () -> (index % 2 == 0 ? one : two).next("test:visit:tenant:1:20261011", 99999)).toList();
            var results = pool.invokeAll(jobs);
            var unique = new HashSet<Long>();
            for (var result : results) unique.add(result.get());
            assertThat(unique).hasSize(400).contains(1L, 400L);
        }
        assertThat(new RedisBusinessNumberCounter(second).next("test:visit:tenant:1:20261011", 99999)).isEqualTo(401);
        assertThat(one.next("test:visit:tenant:2:20261011", 99999)).isEqualTo(1);
        assertThat(one.next("test:visit:tenant:1:20261012", 99999)).isEqualTo(1);
        assertThat(first.getExpire("test:visit:tenant:1:20261011")).isEqualTo(-1);
    }

    @Test
    void capacity_check_is_atomic_and_never_increments_an_exhausted_counter() throws Exception {
        String key = "test:capacity"; first.opsForValue().set(key, "99998");
        var one = new RedisBusinessNumberCounter(first); var two = new RedisBusinessNumberCounter(second);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var results = pool.invokeAll(List.<java.util.concurrent.Callable<Long>>of(() -> one.next(key, 99999), () -> two.next(key, 99999)));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(99999L, -1L);
        }
        assertThat(one.next(key, 99999)).isEqualTo(-1);
        assertThat(first.opsForValue().get(key)).isEqualTo("99999");
        first.opsForValue().set("test:large", "999999999998");
        assertThat(one.next("test:large", 999999999999L)).isEqualTo(999999999999L);
        assertThat(one.next("test:large", 999999999999L)).isEqualTo(-1);
    }

    @Test
    void corrupt_state_is_reported_and_preserved_instead_of_resetting_the_counter() {
        var counter = new RedisBusinessNumberCounter(first);
        for (String invalid : List.of("broken", "-1", "1.5", "9999999999999")) {
            first.opsForValue().set("test:corrupt", invalid);
            assertThatThrownBy(() -> counter.next("test:corrupt", 99999)).isInstanceOf(RuntimeException.class);
            assertThat(first.opsForValue().get("test:corrupt")).isEqualTo(invalid);
        }
    }

    private static LettuceConnectionFactory connection(int port) {
        var factory = new LettuceConnectionFactory("127.0.0.1", port);
        factory.afterPropertiesSet(); factory.start(); return factory;
    }
}
