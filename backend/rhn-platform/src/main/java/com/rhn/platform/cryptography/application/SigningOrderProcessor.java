package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.SigningOrder;
import com.rhn.platform.cryptography.domain.SigningOrderStatus;
import com.rhn.platform.cryptography.infrastructure.CaSignerRepository;
import com.rhn.platform.cryptography.infrastructure.SigningOrderRepository;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort.RemoteOrderRef;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort.RemoteOrderStatus;
import com.rhn.platform.cryptography.spi.CaRemoteSigningPort.RemoteSignature;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

/**
 * Drives remote signing orders after the business transaction committed: submit, poll, fetch and
 * complete. Vendor calls run outside database transactions; each state change re-locks the order and
 * is skipped when the order moved on meanwhile (for example cancelled by the signer).
 */
@Service
public class SigningOrderProcessor {
    private static final Logger LOG = LoggerFactory.getLogger(SigningOrderProcessor.class);
    private static final List<SigningOrderStatus> ACTIVE =
            List.of(SigningOrderStatus.PENDING, SigningOrderStatus.AWAITING_SIGNER, SigningOrderStatus.SIGNED);

    private final SigningOrderRepository orders;
    private final CaSignerRepository signers;
    private final CaVendorRegistry registry;
    private final SigningOrderCompletion completion;
    private final CaProperties properties;
    private final TransactionTemplate transactions;

    public SigningOrderProcessor(SigningOrderRepository orders, CaSignerRepository signers, CaVendorRegistry registry,
                                 SigningOrderCompletion completion, CaProperties properties,
                                 PlatformTransactionManager transactionManager) {
        this.orders = orders;
        this.signers = signers;
        this.registry = registry;
        this.completion = completion;
        this.properties = properties;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /** Processes up to {@code limit} due orders; returns how many were attempted. */
    public int processDue(int limit) {
        List<Long> due = orders.findDue(ACTIVE, Instant.now(), PageRequest.of(0, limit));
        for (Long id : due) {
            try {
                process(id);
            } catch (RuntimeException exception) {
                LOG.warn("Signing order {} processing failed", id, exception);
            }
        }
        return due.size();
    }

    /** Makes an order due now, for vendor callbacks; the callback content itself is never trusted. */
    public void expedite(String vendorCode, String externalOrderId) {
        transactions.executeWithoutResult(status -> orders.findByVendorCodeAndExternalOrderId(vendorCode, externalOrderId)
                .flatMap(order -> orders.findLocked(order.id()))
                .filter(order -> !order.status().terminal())
                .ifPresent(order -> order.claim(Instant.now(), Duration.ZERO)));
    }

    /** Processes one order immediately, regardless of its next check time (development tooling, callbacks). */
    public void processNow(Long orderId) {
        transactions.executeWithoutResult(status -> orders.findLocked(orderId)
                .filter(order -> !order.status().terminal())
                .ifPresent(order -> order.claim(Instant.now(), Duration.ZERO)));
        process(orderId);
    }

    public void process(Long orderId) {
        Work work = transactions.execute(status -> claim(orderId));
        if (work == null) return;
        CaRemoteSigningPort port = work.port();
        RemoteOrderRef ref = new RemoteOrderRef(work.tenantId(), work.organizationId(), orderId, work.externalOrderId());
        switch (work.status()) {
            case PENDING -> submit(work, port);
            case AWAITING_SIGNER -> {
                RemoteOrderStatus remote;
                try {
                    remote = port.query(ref);
                } catch (RuntimeException exception) {
                    apply(orderId, SigningOrderStatus.AWAITING_SIGNER, order ->
                            order.polled(SigningOrderStatus.AWAITING_SIGNER, null, Instant.now(),
                                    properties.backoff(order.attempts())));
                    return;
                }
                onRemoteStatus(work, port, ref, remote);
            }
            case SIGNED -> fetchAndComplete(orderId, port, ref);
            default -> {
            }
        }
    }

    private Work claim(Long orderId) {
        SigningOrder order = orders.findLocked(orderId).orElse(null);
        Instant now = Instant.now();
        if (order == null || order.status().terminal() || order.nextCheckAt() == null || order.nextCheckAt().isAfter(now)) {
            return null;
        }
        if (!order.expiresAt().isAfter(now)) {
            order.finish(SigningOrderStatus.EXPIRED, now);
            completion.cancelRemoteAfterCommit(order);
            return null;
        }
        if (order.mode() == SigningMode.CLIENT_TOKEN) {
            order.claim(now, Duration.between(now, order.expiresAt()));
            return null;
        }
        Optional<CaRemoteSigningPort> port = registry.byCode(order.vendorCode()).flatMap(CaVendorAdapter::remoteSigning);
        if (port.isEmpty()) {
            order.fail("CA_VENDOR_UNAVAILABLE", "签名厂商适配器不可用", now);
            return null;
        }
        String externalSignerId = order.signerId() == null ? null
                : signers.findById(order.signerId()).map(CaSigner::externalSignerId).orElse(null);
        order.claim(now, properties.claimLease());
        return new Work(order.id(), order.tenantId(), order.organizationId(), order.status(), order.mode(),
                order.sceneCode(), externalSignerId, order.externalOrderId(), order.statementDigestAlgorithm(),
                Base64.getDecoder().decode(order.statementDigest()), order.subject(), order.patientDisplay(),
                order.expiresAt(), port.get());
    }

    private void submit(Work work, CaRemoteSigningPort port) {
        RemoteOrderStatus remote;
        try {
            remote = port.submit(new CaRemoteSigningPort.RemoteSigningRequest(work.tenantId(), work.organizationId(),
                    work.orderId(), work.externalSignerId(), work.mode(), work.sceneCode(), work.digestAlgorithm(),
                    work.statementDigest(), work.subject(), work.patientDisplay(), work.expiresAt()));
        } catch (RuntimeException exception) {
            apply(work.orderId(), SigningOrderStatus.PENDING, order -> order.submitFailed("CA_SUBMIT_FAILED",
                    exception.getMessage(), Instant.now(), properties.backoff(order.attempts()),
                    order.attempts() + 1 >= properties.maxSubmitAttempts()));
            return;
        }
        if (remote == null || remote.externalOrderId() == null || remote.externalOrderId().isBlank()) {
            apply(work.orderId(), SigningOrderStatus.PENDING, order -> order.fail("CA_SUBMIT_INVALID",
                    "签名厂商未返回任务号", Instant.now()));
            return;
        }
        apply(work.orderId(), SigningOrderStatus.PENDING, order -> order.submitted(remote.externalOrderId(),
                remote.claimContent(), SigningOrderStatus.AWAITING_SIGNER, Instant.now(), properties.pollInterval()));
        Work submitted = new Work(work.orderId(), work.tenantId(), work.organizationId(),
                SigningOrderStatus.AWAITING_SIGNER, work.mode(), work.sceneCode(), work.externalSignerId(),
                remote.externalOrderId(), work.digestAlgorithm(), work.statementDigest(), work.subject(),
                work.patientDisplay(), work.expiresAt(), port);
        onRemoteStatus(submitted, port, new RemoteOrderRef(work.tenantId(), work.organizationId(), work.orderId(),
                remote.externalOrderId()), remote);
    }

    private void onRemoteStatus(Work work, CaRemoteSigningPort port, RemoteOrderRef ref, RemoteOrderStatus remote) {
        if (remote == null || remote.state() == null) return;
        switch (remote.state()) {
            case AWAITING_SIGNER -> apply(work.orderId(), SigningOrderStatus.AWAITING_SIGNER, order ->
                    order.polled(SigningOrderStatus.AWAITING_SIGNER, remote.claimContent(), Instant.now(),
                            properties.backoff(order.attempts())));
            case SIGNED -> {
                apply(work.orderId(), SigningOrderStatus.AWAITING_SIGNER, order ->
                        order.polled(SigningOrderStatus.SIGNED, null, Instant.now(), properties.pollInterval()));
                fetchAndComplete(work.orderId(), port, ref);
            }
            case REJECTED -> finish(work.orderId(), SigningOrderStatus.REJECTED);
            case EXPIRED -> finish(work.orderId(), SigningOrderStatus.EXPIRED);
            case CANCELLED -> finish(work.orderId(), SigningOrderStatus.CANCELLED);
            case VOIDED_BY_SIGNER -> finish(work.orderId(), SigningOrderStatus.CANCELLED);
            case FAILED -> apply(work.orderId(), SigningOrderStatus.AWAITING_SIGNER, order ->
                    order.fail("CA_VENDOR_FAILED", remote.message(), Instant.now()));
        }
    }

    private void fetchAndComplete(Long orderId, CaRemoteSigningPort port, RemoteOrderRef ref) {
        RemoteSignature signature;
        try {
            signature = port.fetch(ref);
        } catch (RuntimeException exception) {
            apply(orderId, SigningOrderStatus.SIGNED, order -> order.polled(SigningOrderStatus.SIGNED, null,
                    Instant.now(), properties.backoff(order.attempts())));
            return;
        }
        apply(orderId, SigningOrderStatus.SIGNED, order -> completion.complete(order, signature.format(),
                signature.signatureValue(), signature.certificate(), signature.signedEnvelope(),
                signature.timestampAuthority(), signature.timestampToken()));
    }

    private void finish(Long orderId, SigningOrderStatus terminal) {
        apply(orderId, null, order -> order.finish(terminal, Instant.now()));
    }

    /** Applies a change only when the order is still in {@code expected} (any non-terminal state when null). */
    private void apply(Long orderId, SigningOrderStatus expected, java.util.function.Consumer<SigningOrder> change) {
        transactions.executeWithoutResult(status -> orders.findLocked(orderId)
                .filter(order -> expected == null ? !order.status().terminal() : order.status() == expected)
                .ifPresent(change));
    }

    private record Work(Long orderId, Long tenantId, Long organizationId, SigningOrderStatus status, SigningMode mode,
                        String sceneCode, String externalSignerId, String externalOrderId, String digestAlgorithm,
                        byte[] statementDigest, String subject, String patientDisplay, Instant expiresAt,
                        CaRemoteSigningPort port) {}
}
