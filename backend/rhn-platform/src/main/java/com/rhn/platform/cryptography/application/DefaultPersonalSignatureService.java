package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.api.EvidenceVerification;
import com.rhn.platform.cryptography.api.PersonalSignatureService;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSignature;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSigningMaterial;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureRequest;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureStatus;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SigningCapability;
import com.rhn.platform.cryptography.api.ProtectionPurpose;
import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.domain.CaSigner;
import com.rhn.platform.cryptography.domain.CryptographicEvidence;
import com.rhn.platform.cryptography.domain.SigningOrder;
import com.rhn.platform.cryptography.domain.SigningOrderStatus;
import com.rhn.platform.cryptography.infrastructure.SigningOrderRepository;
import com.rhn.platform.cryptography.spi.CaVendorAdapter;
import com.rhn.platform.cryptography.spi.SignatureFormat;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DefaultPersonalSignatureService implements PersonalSignatureService {
    private static final Pattern SCENE = Pattern.compile("[A-Z][A-Z0-9_]{1,63}");
    private static final List<SigningMode> DEFAULT_MODE_ORDER =
            List.of(SigningMode.PUSH, SigningMode.QR_CLAIM, SigningMode.CLIENT_TOKEN, SigningMode.AUTO);

    private final SigningOrderRepository orders;
    private final DefaultCryptographicEvidenceService evidence;
    private final CaVendorRegistry registry;
    private final CaSignerService signers;
    private final SigningOrderCompletion completion;
    private final CaProperties properties;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public DefaultPersonalSignatureService(SigningOrderRepository orders, DefaultCryptographicEvidenceService evidence,
                                           CaVendorRegistry registry, CaSignerService signers,
                                           SigningOrderCompletion completion, CaProperties properties,
                                           ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.orders = orders;
        this.evidence = evidence;
        this.registry = registry;
        this.signers = signers;
        this.completion = completion;
        this.properties = properties;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Override
    @Transactional
    public SignatureStatus request(SignatureRequest request) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (request == null || request.attestationEvidenceId() == null) {
            throw badRequest("CA_ATTESTATION_REQUIRED", "请指定签署行为证据");
        }
        String scene = request.sceneCode() == null ? "" : request.sceneCode().trim();
        if (!SCENE.matcher(scene).matches()) throw badRequest("CA_SCENE_INVALID", "签名场景编码无效");
        String subject = request.subject() == null ? "" : request.subject().trim();
        if (subject.isEmpty() || subject.length() > 200) throw badRequest("CA_SUBJECT_INVALID", "签名主题需为 1-200 字");
        String patientDisplay = request.patientDisplay() == null || request.patientDisplay().isBlank()
                ? null : request.patientDisplay().trim();
        if (patientDisplay != null && patientDisplay.length() > 64) {
            throw badRequest("CA_PATIENT_DISPLAY_INVALID", "患者展示名过长");
        }
        CryptographicEvidence attestation = requireOwnAttestation(context, request.attestationEvidenceId());

        List<SigningOrder> existing = orders.findByTenantIdAndAttestationEvidenceIdInOrderByCreatedAtDescIdDesc(
                context.tenantId(), List.of(attestation.id()));
        Optional<SigningOrder> reusable = existing.stream()
                .filter(order -> !order.status().terminal() || order.status() == SigningOrderStatus.VERIFIED)
                .findFirst();
        if (reusable.isPresent()) return view(reusable.get());

        Optional<CaVendorAdapter> adapter = registry.forOrganization(context.tenantId(), context.organizationId());
        if (adapter.isEmpty()) return SignatureStatus.notApplicable(attestation.id(), "CA_NOT_CONFIGURED");
        CaVendorAdapter vendor = adapter.get();
        SigningMode mode = mode(vendor, request.mode());
        if (mode == null) return SignatureStatus.notApplicable(attestation.id(), "CA_MODE_UNSUPPORTED");
        if (mode != SigningMode.CLIENT_TOKEN && vendor.remoteSigning().isEmpty()) {
            return SignatureStatus.notApplicable(attestation.id(), "CA_MODE_UNSUPPORTED");
        }
        Instant now = Instant.now();
        List<CaSigner> usable = signers.usable(context.tenantId(), context.subjectId(), vendor.vendorCode(), now);
        if (usable.isEmpty()) return SignatureStatus.notApplicable(attestation.id(), "CA_SIGNER_NOT_ENROLLED");

        Long orderId = GlobalIds.next();
        Long resultEvidenceId = GlobalIds.next();
        SigningOrder.PreparedStatement statement = evidence.preparePersonalStatement(resultEvidenceId, orderId,
                attestation, vendor.vendorCode(), vendor.capabilities().assurance().name(), mode.channel(),
                scene, context, now);
        SigningOrder order = new SigningOrder(orderId, context.tenantId(), context.organizationId(),
                context.subjectId(), context.actor(), mode == SigningMode.CLIENT_TOKEN ? null : usable.getFirst().id(),
                attestation.id(), resultEvidenceId, scene, vendor.vendorCode(), vendor.capabilities().assurance().name(),
                mode, statement, context.correlationId(), subject, patientDisplay, now, properties.orderTtl());
        if (mode == SigningMode.CLIENT_TOKEN) {
            // Nothing to dispatch: the browser signs. The dispatcher only revisits it to expire it.
            order.submitted(null, null, SigningOrderStatus.AWAITING_SIGNER, now, properties.orderTtl());
        }
        return view(orders.save(order));
    }

    @Override
    @Transactional(readOnly = true)
    public SignatureStatus status(Long orderId) {
        return view(requireOwnOrder(contextProvider.requireCurrent(), orderId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SignatureStatus> forAttestations(Collection<Long> attestationEvidenceIds) {
        if (attestationEvidenceIds == null || attestationEvidenceIds.isEmpty()) return List.of();
        if (attestationEvidenceIds.size() > 200) throw badRequest("CA_QUERY_TOO_LARGE", "一次最多查询 200 条签名状态");
        ExecutionContext context = contextProvider.requireCurrent();
        Map<Long, SigningOrder> latest = new LinkedHashMap<>();
        for (SigningOrder order : orders.findByTenantIdAndAttestationEvidenceIdInOrderByCreatedAtDescIdDesc(
                context.tenantId(), attestationEvidenceIds)) {
            latest.putIfAbsent(order.attestationEvidenceId(), order);
        }
        // Colleagues may see whether a record carries a CA signature, but never another signer's QR claim.
        return latest.values().stream().map(order -> {
            SignatureStatus view = view(order);
            return order.userId().equals(context.subjectId()) ? view : withoutClaim(view);
        }).toList();
    }

    private static SignatureStatus withoutClaim(SignatureStatus view) {
        return new SignatureStatus(view.orderId(), view.attestationEvidenceId(), view.status(), view.reason(),
                view.mode(), view.vendorCode(), null, view.expiresAt(), view.evidenceId(), view.signerName(),
                view.certificateIssuer(), view.certificateSerial(), view.signedAt(), view.trustedTimestamp(),
                view.errorCode(), view.errorMessage());
    }

    @Override
    @Transactional(readOnly = true)
    public ClientSigningMaterial clientMaterial(Long orderId) {
        ExecutionContext context = contextProvider.requireCurrent();
        SigningOrder order = requireOwnOrder(context, orderId);
        requireClientSignable(order);
        List<String> fingerprints = signers.usable(context.tenantId(), context.subjectId(), order.vendorCode(),
                        Instant.now()).stream().map(CaSigner::certificateFingerprint)
                .filter(value -> value != null).toList();
        return new ClientSigningMaterial(order.id(),
                Base64.getEncoder().encodeToString(order.statementJson().getBytes(StandardCharsets.UTF_8)),
                order.statementDigestAlgorithm(), order.statementDigest(), fingerprints, order.expiresAt());
    }

    @Override
    @Transactional
    public SignatureStatus submitClientSignature(Long orderId, ClientSignature signature) {
        ExecutionContext context = contextProvider.requireCurrent();
        requireOwnOrder(context, orderId);
        SigningOrder order = orders.findLocked(orderId).orElseThrow();
        requireClientSignable(order);
        if (signature == null || blank(signature.signatureValue()) || blank(signature.certificate())) {
            throw badRequest("CA_SIGNATURE_REQUIRED", "请提交签名值和签名证书");
        }
        completion.complete(order, SignatureFormat.SM2_STATEMENT, signature.signatureValue(), signature.certificate(),
                null, null, null);
        return view(orders.saveAndFlush(order));
    }

    @Override
    @Transactional
    public SignatureStatus cancel(Long orderId) {
        ExecutionContext context = contextProvider.requireCurrent();
        requireOwnOrder(context, orderId);
        SigningOrder order = orders.findLocked(orderId).orElseThrow();
        if (order.status().terminal()) {
            throw conflict("CA_SIGNING_ORDER_FINISHED", "签名任务已结束，不能取消");
        }
        order.finish(SigningOrderStatus.CANCELLED, Instant.now());
        completion.cancelRemoteAfterCommit(order);
        return view(orders.saveAndFlush(order));
    }

    @Override
    @Transactional(readOnly = true)
    public EvidenceVerification verify(Long orderId) {
        ExecutionContext context = contextProvider.requireCurrent();
        SigningOrder order = orders.findByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("CA_SIGNING_ORDER_NOT_FOUND", "未找到签名任务"));
        if (order.status() != SigningOrderStatus.VERIFIED && order.status() != SigningOrderStatus.VOIDED_BY_SIGNER) {
            throw conflict("CA_SIGNATURE_NOT_AVAILABLE", "签名任务尚未产生个人签名证据");
        }
        CryptographicEvidence attestation = evidence.evidence(context.tenantId(), order.attestationEvidenceId())
                .orElseThrow(() -> notFound("CRYPTO_EVIDENCE_NOT_FOUND", "未找到签署行为证据"));
        return evidence.verify(order.resultEvidenceId(), attestation.statementJson().getBytes(StandardCharsets.UTF_8));
    }

    @Override
    @Transactional(readOnly = true)
    public SigningCapability capability() {
        ExecutionContext context = contextProvider.requireCurrent();
        Optional<CaVendorAdapter> adapter = registry.forOrganization(context.tenantId(), context.organizationId());
        if (adapter.isEmpty()) return new SigningCapability(false, null, java.util.Set.of(), List.of());
        CaVendorAdapter vendor = adapter.get();
        java.util.Set<SigningMode> modes = new java.util.LinkedHashSet<>(vendor.capabilities().signingModes());
        if (vendor.remoteSigning().isEmpty()) modes.retainAll(java.util.Set.of(SigningMode.CLIENT_TOKEN));
        return new SigningCapability(true, vendor.vendorCode(), java.util.Set.copyOf(modes),
                signers.mine().stream().filter(value -> value.vendorCode().equals(vendor.vendorCode())).toList());
    }

    private CryptographicEvidence requireOwnAttestation(ExecutionContext context, Long evidenceId) {
        CryptographicEvidence attestation = evidence.evidence(context.tenantId(), evidenceId)
                .orElseThrow(() -> notFound("CRYPTO_EVIDENCE_NOT_FOUND", "未找到签署行为证据"));
        if (!ProtectionPurpose.ATTESTATION.name().equals(attestation.protectionPurpose())) {
            throw badRequest("CA_TARGET_NOT_ATTESTATION", "只能对签署行为证据进行个人 CA 签名");
        }
        var statement = jsonCodec.readTree(attestation.statementJson()).get("actorId");
        String actorId = statement == null || statement.isNull() ? null : statement.asString();
        if (context.subjectId() == null || !context.subjectId().toString().equals(actorId)) {
            throw forbidden("CA_SIGNER_NOT_ACTOR", "只能对本人完成的签署行为进行 CA 签名");
        }
        return attestation;
    }

    private SigningOrder requireOwnOrder(ExecutionContext context, Long orderId) {
        SigningOrder order = orders.findByIdAndTenantId(orderId, context.tenantId())
                .orElseThrow(() -> notFound("CA_SIGNING_ORDER_NOT_FOUND", "未找到签名任务"));
        if (!order.userId().equals(context.subjectId())) {
            throw notFound("CA_SIGNING_ORDER_NOT_FOUND", "未找到签名任务");
        }
        return order;
    }

    private static void requireClientSignable(SigningOrder order) {
        if (order.mode() != SigningMode.CLIENT_TOKEN) {
            throw conflict("CA_SIGNING_MODE_MISMATCH", "该签名任务不是 UKey 签名方式");
        }
        if (order.status() != SigningOrderStatus.AWAITING_SIGNER) {
            throw conflict("CA_SIGNING_ORDER_FINISHED", "签名任务已结束");
        }
        if (!order.expiresAt().isAfter(Instant.now())) {
            throw conflict("CA_SIGNING_ORDER_EXPIRED", "签名任务已过期");
        }
    }

    private static SigningMode mode(CaVendorAdapter vendor, SigningMode requested) {
        var supported = vendor.capabilities().signingModes();
        if (requested != null) return supported.contains(requested) ? requested : null;
        return DEFAULT_MODE_ORDER.stream().filter(supported::contains).findFirst().orElse(null);
    }

    SignatureStatus view(SigningOrder order) {
        CryptographicEvidence result = order.status() == SigningOrderStatus.VERIFIED
                || order.status() == SigningOrderStatus.VOIDED_BY_SIGNER
                ? evidence.evidence(order.tenantId(), order.resultEvidenceId()).orElse(null) : null;
        return new SignatureStatus(order.id(), order.attestationEvidenceId(), order.status().name(), null,
                order.mode(), order.vendorCode(), order.claimContent(), order.expiresAt(),
                result == null ? null : result.id(), result == null ? null : result.signerName(),
                result == null ? null : result.certificateIssuer(),
                result == null ? null : result.certificateSerial(),
                result == null ? null : result.signedAt(),
                result != null && !blank(result.timestampToken()), order.errorCode(), order.errorMessage());
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
