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
        assertEquals("DEVELOPMENT_ONLY", valid.providerAssurance());

        EvidenceVerification changedContent = evidenceService.verify(second.evidenceId(), bytes("被篡改的内容"));
        assertFalse(changedContent.valid());
        assertEquals("CONTENT_MISMATCH", changedContent.status());

        jdbcTemplate.update("""
                update cryptographic_evidence
                   set statement_json = replace(statement_json, 'UPDATE', 'DELETE')
                 where id = ?
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
                "SM2");

        BusinessException exception = assertThrows(BusinessException.class, () -> productionService.protect(
                new ProtectionRequest(ProtectionProfile.CLINICAL_DOCUMENT_CONTENT, "CriticalData",
                        com.rhn.shared.id.GlobalIds.next(), 1L, "CREATE", "RHN.TEST.V1", bytes("内容"), Map.of())));

        assertEquals("CRYPTO_PROVIDER_UNAVAILABLE", exception.code());
        assertEquals(503, exception.status().value());
    }

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
