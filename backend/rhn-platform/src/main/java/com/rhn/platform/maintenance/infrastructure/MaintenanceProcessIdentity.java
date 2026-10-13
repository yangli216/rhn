package com.rhn.platform.maintenance.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.InetAddress;
import java.time.Instant;
import java.util.Optional;

/** A dead process can be proven only inside the same configured OS process namespace. */
@Component
public class MaintenanceProcessIdentity {
    private final String node;
    private final long pid = ProcessHandle.current().pid();
    private final Long started = ProcessHandle.current().info().startInstant().map(Instant::toEpochMilli).orElse(null);
    public MaintenanceProcessIdentity(@Value("${rhn.maintenance.process-namespace:}") String configured) {
        node = configured.isBlank() ? hostname() : configured;
    }
    public String node() { return node; }
    public long pid() { return pid; }
    public Long started() { return started; }
    public boolean provenDead(String ownerNode, Long ownerPid, Long ownerStarted) {
        if (!node.equals(ownerNode) || ownerPid == null || ownerStarted == null || started == null) return false;
        Optional<ProcessHandle> owner = ProcessHandle.of(ownerPid);
        if (owner.isEmpty() || !owner.get().isAlive()) return true;
        return owner.get().info().startInstant().map(instant -> instant.toEpochMilli() != ownerStarted).orElse(false);
    }
    private String hostname() {
        try { return InetAddress.getLocalHost().getHostName(); }
        catch (Exception unavailable) { return "unresolved-" + com.rhn.shared.id.GlobalIds.next(); }
    }
}
