package com.rhn.platform.cryptography.web;

import com.rhn.platform.cryptography.api.PersonalSignatureService;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSigningMaterial;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureStatus;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignerView;
import com.rhn.platform.cryptography.application.CaSignerService;
import com.rhn.platform.cryptography.application.SigningOrderProcessor;
import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.CaSignerMedium;
import com.rhn.platform.cryptography.infrastructure.ca.development.DevelopmentCaAdapter;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * Development-only stand-ins for the vendor app and UKey middleware, so the signing flow can be exercised
 * without real certificates. Only registered with {@code rhn.crypto.ca.development.enabled=true}; the
 * registry refuses the development adapter whenever compliance enforcement is on.
 */
@RestController
@RequestMapping("/api/crypto/dev-ca")
@ConditionalOnProperty(prefix = "rhn.crypto.ca.development", name = "enabled", havingValue = "true")
public class DevelopmentCaController {
    private final DevelopmentCaAdapter adapter;
    private final CaSignerService signers;
    private final PersonalSignatureService signatures;
    private final SigningOrderProcessor processor;
    private final ExecutionContextProvider contextProvider;

    public DevelopmentCaController(DevelopmentCaAdapter adapter, CaSignerService signers,
                                   PersonalSignatureService signatures, SigningOrderProcessor processor,
                                   ExecutionContextProvider contextProvider) {
        this.adapter = adapter;
        this.signers = signers;
        this.signatures = signatures;
        this.processor = processor;
        this.contextProvider = contextProvider;
    }

    /** Issues a simulated certificate for the current account and binds it. */
    @PostMapping("/enrollments")
    SignerView enroll() {
        ExecutionContext context = contextProvider.requireCurrent();
        DevelopmentCaAdapter.Issued issued = adapter.issue(context.subjectId(), context.actor());
        CaSigner signer = signers.bind(context, context.subjectId(), context.practitionerId(),
                DevelopmentCaAdapter.CODE, issued.externalSignerId(), CaSignerMedium.MOBILE, issued.certificate());
        return signers.mine().stream().filter(value -> value.id().equals(signer.id())).findFirst().orElseThrow();
    }

    /** Simulates confirming a push order (or claiming a QR order) in the phone app. */
    @PostMapping("/orders/{orderId}/confirm")
    SignatureStatus confirm(@PathVariable Long orderId) {
        String externalSignerId = ownSigner().externalSignerId();
        return simulate(orderId, () -> adapter.confirm(orderId, externalSignerId));
    }

    @PostMapping("/orders/{orderId}/reject")
    SignatureStatus reject(@PathVariable Long orderId) {
        return simulate(orderId, () -> adapter.reject(orderId));
    }

    private SignatureStatus simulate(Long orderId, Runnable action) {
        signatures.status(orderId);
        processor.processNow(orderId);
        try {
            action.run();
        } catch (IllegalStateException exception) {
            throw conflict("CA_DEVELOPMENT_ORDER_UNAVAILABLE", "该签名任务当前没有待处理的开发 CA 订单");
        }
        processor.processNow(orderId);
        return signatures.status(orderId);
    }

    /** Simulates the UKey middleware: returns a signature the browser then submits as a client signature. */
    @PostMapping("/orders/{orderId}/client-sign")
    DevelopmentCaAdapter.ClientSigned clientSign(@PathVariable Long orderId) {
        ClientSigningMaterial material = signatures.clientMaterial(orderId);
        return adapter.signLocally(ownSigner().externalSignerId(), Base64.getDecoder().decode(material.toBeSigned()));
    }

    /** Simulates granting auto-sign in the phone app for the given number of hours. */
    @PostMapping("/grants")
    void grant(@Valid @RequestBody GrantRequest request) {
        adapter.grant(ownSigner().externalSignerId(), Duration.ofHours(request.hours()));
    }

    private CaSigner ownSigner() {
        ExecutionContext context = contextProvider.requireCurrent();
        return signers.usable(context.tenantId(), context.subjectId(), DevelopmentCaAdapter.CODE, Instant.now())
                .stream().findFirst()
                .orElseThrow(() -> conflict("CA_SIGNER_NOT_ENROLLED", "当前账号尚未签发开发证书"));
    }

    record GrantRequest(@Min(1) @Max(24) int hours) {}
}
