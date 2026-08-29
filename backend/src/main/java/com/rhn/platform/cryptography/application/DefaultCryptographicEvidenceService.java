package com.rhn.platform.cryptography.application;

import cn.hutool.core.util.StrUtil;
import com.rhn.platform.cryptography.api.CryptographicEvidenceService;
import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.platform.cryptography.api.EvidenceVerification;
import com.rhn.platform.cryptography.api.ProtectionProfile;
import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.platform.cryptography.domain.CryptographicEvidence;
import com.rhn.platform.cryptography.infrastructure.CryptographicEvidenceRepository;
import com.rhn.platform.cryptography.spi.CryptographicProvider;
import com.rhn.platform.cryptography.spi.DigestValue;
import com.rhn.platform.cryptography.spi.ProviderAssurance;
import com.rhn.platform.cryptography.spi.ProviderDescriptor;
import com.rhn.platform.cryptography.spi.SignatureMaterial;
import com.rhn.platform.cryptography.spi.SignerType;
import com.rhn.platform.cryptography.spi.SigningCommand;
import com.rhn.platform.cryptography.spi.VerificationCommand;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DefaultCryptographicEvidenceService implements CryptographicEvidenceService {
    private static final int STATEMENT_VERSION = 1;
    private static final String STATEMENT_ENCODING = "RHN-EVIDENCE-JSON-1";

    private final CryptographicEvidenceRepository repository;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final List<CryptographicProvider> providers;
    private final String activeProviderCode;
    private final boolean enforceCompliance;
    private final String requiredDigestAlgorithm;
    private final String requiredSignatureAlgorithm;

    public DefaultCryptographicEvidenceService(
            CryptographicEvidenceRepository repository,
            ExecutionContextProvider contextProvider,
            JsonCodec jsonCodec,
            List<CryptographicProvider> providers,
            @Value("${rhn.crypto.active-provider:}") String activeProviderCode,
            @Value("${rhn.crypto.enforce-compliance:true}") boolean enforceCompliance,
            @Value("${rhn.crypto.required-digest-algorithm:SM3}") String requiredDigestAlgorithm,
            @Value("${rhn.crypto.required-signature-algorithm:SM2}") String requiredSignatureAlgorithm) {
        this.repository = repository;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
        this.providers = List.copyOf(providers);
        this.activeProviderCode = activeProviderCode;
        this.enforceCompliance = enforceCompliance;
        this.requiredDigestAlgorithm = requiredDigestAlgorithm;
        this.requiredSignatureAlgorithm = requiredSignatureAlgorithm;
    }

    @Override
    @Transactional
    public EvidenceReceipt protect(ProtectionRequest request) {
        ExecutionContext context = contextProvider.requireCurrent();
        CryptographicProvider provider = requireActiveProvider();
        ProviderDescriptor descriptor = provider.descriptor();
        Long evidenceId = com.rhn.shared.id.GlobalIds.next();
        Instant requestedAt = Instant.now();
        DigestValue contentDigest = provider.digest(request.content());
        String contentDigestValue = encode(contentDigest.value());
        Optional<CryptographicEvidence> previous = repository
                .findFirstByTenantIdAndTargetTypeAndTargetIdOrderByRecordedAtDescIdDesc(
                        context.tenantId(), request.targetType(), request.targetId());

        EvidenceStatement statement = new EvidenceStatement(
                STATEMENT_VERSION, STATEMENT_ENCODING, evidenceId, context.tenantId(),
                request.targetType(), request.targetId(), request.targetVersion(), request.operationCode(),
                request.profile().name(), request.profile().purpose().name(), request.contentSchema(),
                contentDigest.algorithm(), contentDigestValue, descriptor.providerCode(),
                descriptor.assurance().name(), context.subjectId(), context.actor(), context.correlationId(),
                requestedAt, previous.map(CryptographicEvidence::id).orElse(null),
                previous.map(CryptographicEvidence::statementDigestAlgorithm).orElse(null),
                previous.map(CryptographicEvidence::statementDigest).orElse(null),
                Map.copyOf(new TreeMap<>(request.attributes())));
        String statementJson = jsonCodec.write(statement);
        byte[] statementBytes = statementJson.getBytes(StandardCharsets.UTF_8);
        DigestValue statementDigest = provider.digest(statementBytes);
        SignatureMaterial signature = provider.sign(new SigningCommand(context.tenantId(), context.subjectId(),
                context.actor(), request.profile(), statementBytes, requestedAt));
        enforceCompliance(request.profile(), context, descriptor, signature, contentDigest.algorithm());

        CryptographicEvidence evidence = repository.save(new CryptographicEvidence(
                evidenceId, context.tenantId(), request, contentDigest.algorithm(), contentDigestValue,
                STATEMENT_VERSION, statementJson, statementDigest.algorithm(), encode(statementDigest.value()),
                previous.map(CryptographicEvidence::id).orElse(null), descriptor, signature,
                context.correlationId()));
        return receipt(evidence);
    }

    @Override
    @Transactional(readOnly = true)
    public EvidenceVerification verify(Long evidenceId, byte[] currentContent) {
        ExecutionContext context = contextProvider.requireCurrent();
        CryptographicEvidence evidence = repository.findByIdAndTenantId(evidenceId, context.tenantId())
                .orElseThrow(() -> notFound("CRYPTO_EVIDENCE_NOT_FOUND", "未找到密码证据"));
        Optional<CryptographicProvider> provider = provider(evidence.providerCode());
        if (provider.isEmpty()) {
            return verification(evidence, false, false, false, false, false, false,
                    "PROVIDER_UNAVAILABLE");
        }

        try {
            JsonNode statement = jsonCodec.readTree(evidence.statementJson());
            boolean statementBound = statementBound(statement, evidence);
            byte[] statementBytes = evidence.statementJson().getBytes(StandardCharsets.UTF_8);
            DigestValue currentStatementDigest = provider.get().digest(
                    evidence.statementDigestAlgorithm(), statementBytes);
            boolean statementDigestValid = MessageDigest.isEqual(
                    currentStatementDigest.value(), decode(evidence.statementDigest()));
            DigestValue currentDigest = provider.get().digest(evidence.contentDigestAlgorithm(),
                    currentContent == null ? new byte[0] : currentContent.clone());
            boolean contentIntact = MessageDigest.isEqual(currentDigest.value(), decode(evidence.contentDigest()));
            boolean signatureValid = provider.get().verify(new VerificationCommand(
                    statementBytes, evidence.signatureAlgorithm(),
                    evidence.keyId(), evidence.signatureValue(), evidence.verificationMaterial(),
                    evidence.certificateSerial(), evidence.certificateIssuer(), evidence.timestampAuthority(),
                    evidence.timestampToken()));
            boolean chainLinkValid = chainLinkValid(evidence, statement);
            boolean valid = contentIntact && statementDigestValid && signatureValid && statementBound
                    && chainLinkValid;
            String status = valid ? "VALID" : !contentIntact ? "CONTENT_MISMATCH"
                    : !statementDigestValid ? "STATEMENT_DIGEST_INVALID"
                    : !signatureValid ? "SIGNATURE_INVALID"
                    : !statementBound ? "STATEMENT_BINDING_INVALID" : "CHAIN_LINK_INVALID";
            return verification(evidence, valid, contentIntact, statementDigestValid, signatureValid, statementBound,
                    chainLinkValid, status);
        } catch (RuntimeException exception) {
            return verification(evidence, false, false, false, false, false, false,
                    "MALFORMED_EVIDENCE");
        }
    }

    @Override
    public void requireValid(Long evidenceId, byte[] currentContent) {
        EvidenceVerification result = verify(evidenceId, currentContent);
        if (!result.valid()) {
            throw conflict("CRYPTO_EVIDENCE_INVALID", "关键数据密码证据校验失败：" + result.status());
        }
    }

    private CryptographicProvider requireActiveProvider() {
        if (StrUtil.isBlank(activeProviderCode)) {
            throw unavailable("未配置密码服务，关键数据操作已拒绝");
        }
        return provider(activeProviderCode).orElseThrow(() ->
                unavailable("未找到已配置的密码服务：" + activeProviderCode));
    }

    private Optional<CryptographicProvider> provider(String code) {
        return providers.stream().filter(value -> value.descriptor().providerCode().equals(code)).findFirst();
    }

    private void enforceCompliance(ProtectionProfile profile, ExecutionContext context,
                                   ProviderDescriptor descriptor, SignatureMaterial signature,
                                   String digestAlgorithm) {
        if (!enforceCompliance) return;
        if (descriptor.assurance() != ProviderAssurance.CERTIFIED_CRYPTO_SERVICE) {
            throw unavailable("当前密码服务未声明为合规密码产品或服务");
        }
        if (!digestAlgorithm.equalsIgnoreCase(requiredDigestAlgorithm)
                || !signature.signatureAlgorithm().toUpperCase().contains(requiredSignatureAlgorithm.toUpperCase())) {
            throw unavailable("当前密码算法不满足已配置的合规策略");
        }
        if (profile.signerBinding() == com.rhn.platform.cryptography.api.SignerBinding.ACTOR) {
            if (context.subjectId() == null || signature.signerType() != SignerType.PERSON
                    || !context.subjectId().equals(signature.signerSubjectId())
                    || StrUtil.isBlank(signature.certificateSerial())
                    || StrUtil.isBlank(signature.certificateIssuer())) {
                throw unavailable("个人不可否认签名未绑定可信账号和个人证书");
            }
        }
        if (profile.trustedTimestampRequired()
                && (StrUtil.isBlank(signature.timestampAuthority()) || StrUtil.isBlank(signature.timestampToken()))) {
            throw unavailable("当前保护策略要求可信时间戳");
        }
    }

    private boolean statementBound(JsonNode node, CryptographicEvidence evidence) {
        return text(node, "evidenceId").equals(evidence.id().toString())
                && text(node, "tenantId").equals(evidence.tenantId().toString())
                && text(node, "targetType").equals(evidence.targetType())
                && text(node, "targetId").equals(evidence.targetId().toString())
                && Objects.equals(nullableLong(node, "targetVersion"), evidence.targetVersionNo())
                && text(node, "operationCode").equals(evidence.operationCode())
                && text(node, "protectionProfile").equals(evidence.protectionProfile())
                && text(node, "protectionPurpose").equals(evidence.protectionPurpose())
                && text(node, "contentSchema").equals(evidence.contentSchema())
                && text(node, "contentDigestAlgorithm").equals(evidence.contentDigestAlgorithm())
                && text(node, "contentDigest").equals(evidence.contentDigest())
                && text(node, "providerCode").equals(evidence.providerCode())
                && text(node, "providerAssurance").equals(evidence.providerAssurance())
                && Objects.equals(nullableId(node, "previousEvidenceId"), evidence.previousEvidenceId());
    }

    private boolean chainLinkValid(CryptographicEvidence evidence, JsonNode statement) {
        if (evidence.previousEvidenceId() == null) {
            return nullableText(statement, "previousStatementDigestAlgorithm") == null
                    && nullableText(statement, "previousStatementDigest") == null;
        }
        Optional<CryptographicEvidence> previous = repository
                .findByIdAndTenantId(evidence.previousEvidenceId(), evidence.tenantId());
        return previous.isPresent()
                && previous.get().statementDigestAlgorithm()
                .equals(nullableText(statement, "previousStatementDigestAlgorithm"))
                && previous.get().statementDigest().equals(nullableText(statement, "previousStatementDigest"));
    }

    private EvidenceReceipt receipt(CryptographicEvidence evidence) {
        return new EvidenceReceipt(evidence.id(), evidence.protectionProfile(), evidence.protectionPurpose(),
                evidence.contentDigestAlgorithm(), evidence.contentDigest(), evidence.providerCode(),
                evidence.providerAssurance(), evidence.signatureAlgorithm(), evidence.keyId(),
                evidence.signerType(), evidence.signerSubjectId(), evidence.signerName(), evidence.signedAt(),
                StrUtil.isNotBlank(evidence.timestampToken()));
    }

    private EvidenceVerification verification(CryptographicEvidence evidence, boolean valid,
                                                boolean contentIntact, boolean statementDigestValid,
                                                boolean signatureValid,
                                                boolean statementBound, boolean chainLinkValid, String status) {
        return new EvidenceVerification(evidence.id(), valid, contentIntact, statementDigestValid,
                signatureValid, statementBound, chainLinkValid, status, evidence.providerCode(),
                evidence.providerAssurance());
    }

    private BusinessException unavailable(String message) {
        return new BusinessException("CRYPTO_PROVIDER_UNAVAILABLE", message, HttpStatus.SERVICE_UNAVAILABLE);
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? "" : value.asText();
    }

    private String nullableText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private Long nullableLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asLong();
    }

    private Long nullableId(JsonNode node, String field) {
        String value = nullableText(node, field);
        return value == null ? null : Long.valueOf(value);
    }

    private String encode(byte[] value) {
        return Base64.getEncoder().encodeToString(value);
    }

    private byte[] decode(String value) {
        return Base64.getDecoder().decode(value);
    }

    private record EvidenceStatement(
            int statementVersion,
            String statementEncoding,
            Long evidenceId,
            Long tenantId,
            String targetType,
            Long targetId,
            Long targetVersion,
            String operationCode,
            String protectionProfile,
            String protectionPurpose,
            String contentSchema,
            String contentDigestAlgorithm,
            String contentDigest,
            String providerCode,
            String providerAssurance,
            Long actorId,
            String actor,
            String correlationId,
            Instant occurredAt,
            Long previousEvidenceId,
            String previousStatementDigestAlgorithm,
            String previousStatementDigest,
            Map<String, String> attributes
    ) {}
}
