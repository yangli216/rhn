package com.rhn.platform.realtime.application;

import com.rhn.platform.realtime.api.RealtimeEvent;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.id.GlobalIds;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RealtimeConnectionRegistry {
    private final ConcurrentHashMap<String, Connection> connections = new ConcurrentHashMap<>();
    private final PresenceLeaseStore presence;
    private final PresenceChangePublisher presenceChanges;
    private final long connectionTimeoutMs;
    private final int maxConnectionsPerUser;
    private final String instanceId;

    public RealtimeConnectionRegistry(PresenceLeaseStore presence, PresenceChangePublisher presenceChanges,
                                      @Value("${rhn.realtime.connection-timeout-ms:1800000}") long connectionTimeoutMs,
                                      @Value("${rhn.realtime.max-connections-per-user:5}") int maxConnectionsPerUser,
                                      @Value("${rhn.instance-id:${random.uuid}}") String instanceId) {
        this.presence = presence;
        this.presenceChanges = presenceChanges;
        this.connectionTimeoutMs = connectionTimeoutMs;
        this.maxConnectionsPerUser = Math.max(1, maxConnectionsPerUser);
        this.instanceId = instanceId;
    }

    public SseEmitter connect(ExecutionContext context, String clientSessionId) {
        evictExcessConnections(context);
        String id = Long.toString(GlobalIds.next());
        Instant now = Instant.now();
        SseEmitter emitter = new SseEmitter(connectionTimeoutMs);
        Connection connection = new Connection(id, instanceId, clientSessionId, context, emitter, now);
        connections.put(id, connection);
        presence.upsert(connection.snapshot());
        emitter.onCompletion(() -> remove(id, "DISCONNECTED"));
        emitter.onTimeout(() -> remove(id, "TIMED_OUT"));
        emitter.onError(error -> remove(id, "FAILED"));
        try {
            send(connection, SseEmitter.event().id("connected:" + id).name("CONNECTED")
                    .data(Map.of("connectionId", id, "connectedAt", now.toString())));
            publishPresenceChanged(connection, "CONNECTED");
        } catch (IOException error) {
            remove(id, "FAILED");
            emitter.completeWithError(error);
        }
        return emitter;
    }

    public void publish(Long tenantId, RealtimeEvent event, String requiredAuthority) {
        connections.values().stream()
                .filter(connection -> tenantId.equals(connection.context.tenantId()))
                .filter(connection -> requiredAuthority == null || connection.context.hasAuthority(requiredAuthority)
                        || connection.context.hasAuthority("ROLE_ADMIN"))
                .filter(connection -> visibleTo(connection.context, event))
                .forEach(connection -> {
                    try {
                        send(connection, SseEmitter.event().id(event.id()).name(event.type()).data(event));
                    } catch (IOException error) {
                        remove(connection.id, "FAILED");
                        connection.emitter.completeWithError(error);
                    }
                });
    }

    public void touch(ExecutionContext context) {
        Instant now = Instant.now();
        connections.values().stream()
                .filter(connection -> sameWorkContext(connection.context, context))
                .forEach(connection -> {
                    connection.lastSeenAt = now;
                    connection.lastActivityAt = now;
                    presence.upsert(connection.snapshot());
                });
    }

    public int connectionCount() {
        return connections.size();
    }

    @EventListener
    public void terminate(PresenceControlCommand command) {
        connections.values().stream()
                .filter(connection -> command.tenantId().equals(connection.context.tenantId()))
                .filter(connection -> command.userId().equals(connection.context.subjectId()))
                .filter(connection -> command.clientSessionIds().contains(connection.clientSessionId))
                .toList().forEach(connection -> {
                    try {
                        RealtimeEvent event = new RealtimeEvent("session:" + GlobalIds.next(), "SESSION_TERMINATED",
                                command.occurredAt(), "WARNING", connection.context.organizationId(),
                                connection.context.departmentId(), command.userId(), "ClientSession", null, null,
                                Map.of("reason", command.reason()));
                        send(connection, SseEmitter.event().id(event.id()).name(event.type()).data(event));
                    } catch (IOException ignored) {
                        // The session is revoked even if the terminal disappeared before receiving the signal.
                    } finally {
                        remove(connection.id, "TERMINATED");
                        connection.emitter.complete();
                    }
                });
    }

    @Scheduled(fixedDelayString = "${rhn.realtime.heartbeat-interval-ms:20000}")
    void heartbeat() {
        Instant now = Instant.now();
        connections.values().forEach(connection -> {
            try {
                send(connection, SseEmitter.event().comment("heartbeat " + now));
                connection.lastSeenAt = now;
                presence.upsert(connection.snapshot());
            } catch (IOException error) {
                remove(connection.id, "FAILED");
                connection.emitter.completeWithError(error);
            }
        });
    }

    private boolean visibleTo(ExecutionContext context, RealtimeEvent event) {
        if (event.recipientUserId() != null && !event.recipientUserId().equals(context.subjectId())) return false;
        if (event.organizationId() != null && !context.canAccessOrganization(event.organizationId())) return false;
        return event.departmentId() == null || context.canAccessDepartment(event.departmentId());
    }

    private void evictExcessConnections(ExecutionContext context) {
        List<Connection> userConnections = connections.values().stream()
                .filter(connection -> context.tenantId().equals(connection.context.tenantId())
                        && context.subjectId().equals(connection.context.subjectId()))
                .sorted(Comparator.comparing(connection -> connection.connectedAt))
                .toList();
        int removeCount = userConnections.size() - maxConnectionsPerUser + 1;
        for (int index = 0; index < removeCount; index++) {
            Connection connection = userConnections.get(index);
            remove(connection.id, "EVICTED");
            connection.emitter.complete();
        }
    }

    private boolean sameWorkContext(ExecutionContext left, ExecutionContext right) {
        return left.tenantId().equals(right.tenantId())
                && left.subjectId().equals(right.subjectId())
                && java.util.Objects.equals(left.organizationId(), right.organizationId())
                && java.util.Objects.equals(left.departmentId(), right.departmentId());
    }

    private void send(Connection connection, SseEmitter.SseEventBuilder event) throws IOException {
        synchronized (connection.emitter) {
            connection.emitter.send(event);
        }
    }

    private void remove(String id, String changeType) {
        Connection removed = connections.remove(id);
        if (removed == null) return;
        presence.remove(removed.context.tenantId(), id);
        publishPresenceChanged(removed, changeType);
    }

    private void publishPresenceChanged(Connection connection, String changeType) {
        presenceChanges.publish(new PresenceChanged(connection.context.tenantId(), connection.context.organizationId(),
                connection.context.departmentId(), changeType, Instant.now()));
    }

    private static final class Connection {
        private final String id;
        private final String instanceId;
        private final String clientSessionId;
        private final ExecutionContext context;
        private final SseEmitter emitter;
        private final Instant connectedAt;
        private volatile Instant lastSeenAt;
        private volatile Instant lastActivityAt;

        private Connection(String id, String instanceId, String clientSessionId,
                           ExecutionContext context, SseEmitter emitter, Instant now) {
            this.id = id;
            this.instanceId = instanceId;
            this.clientSessionId = clientSessionId;
            this.context = context;
            this.emitter = emitter;
            this.connectedAt = now;
            this.lastSeenAt = now;
            this.lastActivityAt = now;
        }

        private PresenceConnectionSnapshot snapshot() {
            return new PresenceConnectionSnapshot(id, instanceId, clientSessionId,
                    context.tenantId(), context.subjectId(), context.actor(),
                    context.practitionerId(), context.organizationId(), context.departmentId(), connectedAt,
                    lastSeenAt, lastActivityAt);
        }
    }
}
