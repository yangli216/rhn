package com.rhn;

import com.rhn.platform.cryptography.api.CryptographicEvidenceService;
import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.platform.cryptography.api.EvidenceVerification;
import com.rhn.platform.cryptography.api.ProtectionProfile;
import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.platform.cryptography.application.DefaultCryptographicEvidenceService;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.RequestCorrelationContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CryptographicEvidenceFoundationTest extends RhnIntegrationTestSupport {
    @Autowired
    CryptographicEvidenceService evidenceService;
    @Autowired
    JdbcTemplate jdbcTemplate;

    @BeforeEach
    void establishExecutionContext() {
        TenantContext.set(Long.valueOf(TENANT));
        RequestCorrelationContext.set("crypto-foundation-test");
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated("doctor", "", java.util.List.of()));
    }

    @AfterEach
    void clearExecutionContext() {
        SecurityContextHolder.clearContext();
        RequestCorrelationContext.clear();
        TenantContext.clear();
    }

    @Test
    void evidence_is_chained_and_detects_content_and_statement_tampering() {
        Long targetId = com.rhn.shared.id.GlobalIds.next();
        EvidenceReceipt first = protect(targetId, 1L, "CREATE", "初始内容");
        EvidenceReceipt second = protect(targetId, 2L, "UPDATE", "第二版内容");

        EvidenceVerification valid = evidenceService.verify(second.evidenceId(), bytes("第二版内容"));
        assertTrue(valid.valid());
        assertTrue(valid.contentIntact());
        assertTrue(valid.statementDigestValid());
        assertTrue(valid.signatureValid());
        assertTrue(valid.statementBound());
        assertTrue(valid.chainLinkValid());
        assertEquals("SOFTWARE", valid.providerAssurance());
        assertEquals("software-sm", valid.providerCode());

        EvidenceVerification changedContent = evidenceService.verify(second.evidenceId(), bytes("被篡改的内容"));
        assertFalse(changedContent.valid());
        assertEquals("CONTENT_MISMATCH", changedContent.status());

        jdbcTemplate.update("""
                update RHN_AUD_CRYPTO_EVID
                   set JSON_STMT = replace(JSON_STMT, 'UPDATE', 'DELETE')
                 where ID_CRYPTO_EVID = ?
                """, second.evidenceId());
        EvidenceVerification changedStatement = evidenceService.verify(second.evidenceId(), bytes("第二版内容"));
        assertFalse(changedStatement.valid());
        assertEquals("STATEMENT_DIGEST_INVALID", changedStatement.status());

        assertTrue(evidenceService.verify(first.evidenceId(), bytes("初始内容")).valid());
    }

    @Test
    void production_policy_fails_closed_when_no_provider_is_configured() {
        Long tenantId = Long.valueOf(TENANT);
        DefaultCryptographicEvidenceService productionService = new DefaultCryptographicEvidenceService(
                null,
                () -> new ExecutionContext(tenantId, com.rhn.shared.id.GlobalIds.next(), "doctor", "fail-closed-test", Set.of()),
                null,
                java.util.List.of(),
                "",
                true,
                "SM3",
                "SM2",
                null);

        BusinessException exception = assertThrows(BusinessException.class, () -> productionService.protect(
                new ProtectionRequest(ProtectionProfile.CLINICAL_DOCUMENT_CONTENT, "CriticalData",
                        com.rhn.shared.id.GlobalIds.next(), 1L, "CREATE", "RHN.TEST.V1", bytes("内容"), Map.of())));

        assertEquals("CRYPTO_PROVIDER_UNAVAILABLE", exception.code());
        assertEquals(503, exception.status().value());
    }

    @Test
    void enforced_policy_accepts_software_sm_for_attestation_but_not_for_certified_only_profiles() {
        DefaultCryptographicEvidenceService enforced = new DefaultCryptographicEvidenceService(
                evidenceRepository, contextProvider, jsonCodec, providers, "software-sm", true, "SM3", "SM2",
                null);
        Long targetId = com.rhn.shared.id.GlobalIds.next();

        EvidenceReceipt attestation = enforced.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_ACTION_ATTESTATION, "FoundationTestData", targetId, 1L, "SIGN",
                "RHN.TEST.V1", bytes("签署内容"), Map.of("signatureMeaning", "AUTHOR")));
        assertEquals("ATTESTATION", attestation.purpose());
        assertEquals("SM3", attestation.contentDigestAlgorithm());
        assertEquals("SM3withSM2", attestation.signatureAlgorithm());
        assertTrue(evidenceService.verify(attestation.evidenceId(), bytes("签署内容")).valid());

        BusinessException certifiedOnly = assertThrows(BusinessException.class, () -> enforced.protect(
                new ProtectionRequest(ProtectionProfile.CLINICAL_DOCUMENT_SIGNATURE, "FoundationTestData",
                        targetId, 1L, "SIGN", "RHN.TEST.V1", bytes("签署内容"), Map.of())));
        assertEquals("CRYPTO_PROVIDER_UNAVAILABLE", certifiedOnly.code());
        assertThrows(IllegalArgumentException.class, () -> enforced.protect(new ProtectionRequest(
                ProtectionProfile.PERSONAL_CA_SIGNATURE, "FoundationTestData", targetId, 1L, "SIGN",
                "RHN.TEST.V1", bytes("签署内容"), Map.of())));
    }

    @Autowired
    com.rhn.platform.cryptography.infrastructure.CryptographicEvidenceRepository evidenceRepository;
    @Autowired
    com.rhn.shared.context.ExecutionContextProvider contextProvider;
    @Autowired
    com.rhn.shared.json.JsonCodec jsonCodec;
    @Autowired
    java.util.List<com.rhn.platform.cryptography.spi.CryptographicProvider> providers;

    private EvidenceReceipt protect(Long targetId, long version, String operation, String content) {
        return evidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_CONTENT,
                "FoundationTestData",
                targetId,
                version,
                operation,
                "RHN.TEST.V1",
                bytes(content),
                Map.of("scenario", "tamper-detection")));
    }

    private byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
