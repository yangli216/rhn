package com.rhn;

import org.junit.platform.launcher.LauncherSession;
import org.junit.platform.launcher.LauncherSessionListener;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Caps how many test JVMs run at once on this machine, across worktrees, Maven runs and IDE runs.
 *
 * <p>Each test JVM holds one of {@code rhn.test.slots} file locks under {@code rhn.test.slot-dir} (default
 * {@code ~/.rhn/test-slots}) until it exits; the OS releases the lock if the process dies. Concurrent full-stack
 * suites otherwise oversubscribe memory (each fork caches several application contexts in a 4 GB heap) and push
 * the machine into swap, which slows every run. {@code -Drhn.test.slots=0} disables the cap.
 */
public final class RhnTestJvmSlot implements LauncherSessionListener {
    private static final Duration REPORT_INTERVAL = Duration.ofSeconds(30);
    private static final Duration RETRY_INTERVAL = Duration.ofMillis(500);
    private static FileLock held;

    @Override
    public void launcherSessionOpened(LauncherSession session) {
        acquireOnce();
    }

    private static synchronized void acquireOnce() {
        if (held != null) return;
        // Surefire also opens a launcher session inside the Maven JVM itself; only forked test JVMs take a slot.
        if (System.getProperty("classworlds.conf") != null) return;
        int slots = Integer.getInteger("rhn.test.slots", 4);
        if (slots <= 0) return;
        Path dir = Path.of(System.getProperty("rhn.test.slot-dir",
                Path.of(System.getProperty("user.home"), ".rhn", "test-slots").toString()));
        Duration maxWait = Duration.ofMinutes(Long.getLong("rhn.test.slot-wait-minutes", 60));
        String owner = ManagementFactory.getRuntimeMXBean().getPid() + " " + System.getProperty("user.dir");
        try {
            Files.createDirectories(dir);
            Instant start = Instant.now();
            Instant nextReport = start;
            while (true) {
                for (int slot = 0; slot < slots; slot++) {
                    FileLock lock = tryLock(dir.resolve("slot-" + slot + ".lock"), owner);
                    if (lock != null) {
                        held = lock;
                        if (Instant.now().isAfter(start.plusSeconds(1))) {
                            System.err.printf("[rhn-test-slot] acquired slot %d after %ds%n", slot,
                                    Duration.between(start, Instant.now()).toSeconds());
                        }
                        return;
                    }
                }
                Instant now = Instant.now();
                if (now.isAfter(start.plus(maxWait))) {
                    throw new IllegalStateException("No free test JVM slot in " + dir + " after " + maxWait
                            + "; holders: " + holders(dir, slots) + ". Raise -Drhn.test.slots or stop stale runs.");
                }
                if (!now.isBefore(nextReport)) {
                    System.err.printf("[rhn-test-slot] all %d test JVM slots busy, waiting (holders: %s)%n",
                            slots, holders(dir, slots));
                    nextReport = now.plus(REPORT_INTERVAL);
                }
                Thread.sleep(RETRY_INTERVAL);
            }
        } catch (IOException exception) {
            System.err.println("[rhn-test-slot] slot directory unavailable, running without the cap: " + exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for a test JVM slot", exception);
        }
    }

    /** Returns the lock (kept open until JVM exit) and records the owner, or null when another process holds it. */
    private static FileLock tryLock(Path file, String owner) throws IOException {
        FileChannel channel = FileChannel.open(file, StandardOpenOption.CREATE, StandardOpenOption.READ,
                StandardOpenOption.WRITE);
        FileLock lock = channel.tryLock();
        if (lock == null) {
            channel.close();
            return null;
        }
        channel.truncate(0);
        channel.write(ByteBuffer.wrap(owner.getBytes(StandardCharsets.UTF_8)), 0);
        return lock;
    }

    private static String holders(Path dir, int slots) {
        List<String> owners = new ArrayList<>();
        for (int slot = 0; slot < slots; slot++) {
            try {
                owners.add(Files.readString(dir.resolve("slot-" + slot + ".lock")).strip());
            } catch (IOException ignored) {
                owners.add("?");
            }
        }
        return String.join("; ", owners);
    }
}
