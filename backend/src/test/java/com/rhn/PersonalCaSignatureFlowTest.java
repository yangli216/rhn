package com.rhn;

import com.rhn.platform.cryptography.api.CryptographicEvidenceService;
import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.platform.cryptography.api.PersonalSignatureService;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSignature;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSigningMaterial;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureRequest;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureStatus;
import com.rhn.platform.cryptography.api.ProtectionProfile;
import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.platform.cryptography.api.SigningMode;
import com.rhn.platform.cryptography.application.CaProperties;
import com.rhn.platform.cryptography.application.CaSignerService;
import com.rhn.platform.cryptography.application.CaVendorRegistry;
import com.rhn.platform.cryptography.application.SigningOrderProcessor;
import com.rhn.platform.cryptography.domain.CaSignerMedium;
import com.rhn.platform.cryptography.infrastructure.ca.development.DevelopmentCaAdapter;
import com.rhn.platform.security.RhnPrincipal;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.RequestCorrelationContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.TestPropertySource;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The development CA is enabled only here, so its endpoints stay out of the test-profile API contract. */
@TestPropertySource(properties = {
        "rhn.crypto.ca.enabled=true",
        "rhn.crypto.ca.default-vendor=development-ca",
        "rhn.crypto.ca.development.enabled=true"
})
class PersonalCaSignatureFlowTest extends RhnIntegrationTestSupport {
    @Autowired CryptographicEvidenceService evidenceService;
    @Autowired PersonalSignatureService signatures;
    @Autowired CaSignerService signers;
    @Autowired DevelopmentCaAdapter developmentCa;
    @Autowired SigningOrderProcessor processor;
    @Autowired ExecutionContextProvider contextProvider;
    @Autowired CaProperties caProperties;
    @Autowired JdbcTemplate jdbcTemplate;

    @BeforeEach
    void tenant() {
        TenantContext.set(Long.valueOf(TENANT));
        RequestCorrelationContext.set("personal-ca-flow-test");
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        RequestCorrelationContext.clear();
        TenantContext.clear();
    }

    @Test
    void request_is_not_applicable_until_the_signer_is_enrolled() {
        Long doctor = actAs("ca-unenrolled");
        EvidenceReceipt attestation = attest("门诊病历");

        SignatureStatus status = signatures.request(request(attestation, SigningMode.PUSH));

        assertEquals("NOT_APPLICABLE", status.status());
        assertEquals("CA_SIGNER_NOT_ENROLLED", status.reason());
        assertEquals(0, countOrders(attestation.evidenceId()));
        assertNotNull(doctor);
    }

    @Test
    void push_signature_is_verified_locally_and_detects_envelope_tampering() {
        actAs("ca-push");
        String signer = enroll();
        EvidenceReceipt attestation = attest("门诊处方");

        SignatureStatus pending = signatures.request(request(attestation, SigningMode.PUSH));
        assertEquals("PENDING", pending.status());
        assertEquals(pending.orderId(), signatures.request(request(attestation, SigningMode.PUSH)).orderId());

        processor.processNow(pending.orderId());
        assertEquals("AWAITING_SIGNER", signatures.status(pending.orderId()).status());

        developmentCa.confirm(pending.orderId(), signer);
        processor.processNow(pending.orderId());
        SignatureStatus verified = signatures.status(pending.orderId());
        assertEquals("VERIFIED", verified.status());
        assertEquals("ca-push", verified.signerName());
        assertTrue(verified.trustedTimestamp());
        assertTrue(verified.certificateIssuer().contains("RHN Development CA"));
        assertTrue(signatures.verify(pending.orderId()).valid());
        assertTrue(evidenceService.verify(attestation.evidenceId(), bytes("门诊处方")).valid());

        Map<String, Object> row = jdbcTemplate.queryForMap("""
                select SD_SIGN_CHANNEL, SD_SIGN_FMT, HASH_SIGNER_CERT, SD_PROT_PROF, ID_TARGET
                  from RHN_AUD_CRYPTO_EVID where ID_CRYPTO_EVID = ?
                """, verified.evidenceId());
        assertEquals("MOBILE_COSIGN", row.get("SD_SIGN_CHANNEL"));
        assertEquals("SM2_ENVELOPE", row.get("SD_SIGN_FMT"));
        assertEquals("PERSONAL_CA_SIGNATURE", row.get("SD_PROT_PROF"));
        assertEquals(attestation.evidenceId(), ((Number) row.get("ID_TARGET")).longValue());
        assertEquals(1, jdbcTemplate.queryForObject(
                "select count(*) from RHN_AUD_CRYPTO_CERT where HASH_CERT = ?", Integer.class,
                row.get("HASH_SIGNER_CERT")));

        jdbcTemplate.update("update RHN_AUD_CRYPTO_EVID set DES_SIGNED_ENVLP = replace(DES_SIGNED_ENVLP, 'SM3', 'SHA256') "
                + "where ID_CRYPTO_EVID = ?", verified.evidenceId());
        var tampered = signatures.verify(pending.orderId());
        assertFalse(tampered.valid());
        assertEquals("SIGNATURE_INVALID", tampered.status());
    }

    @Test
    void ukey_signature_covers_the_frozen_statement_and_must_use_the_signers_own_certificate() {
        actAs("ca-ukey-other");
        String otherSigner = enroll();
        actAs("ca-ukey");
        String signer = enroll();
        EvidenceReceipt attestation = attest("审方记录");

        SignatureStatus awaiting = signatures.request(request(attestation, SigningMode.CLIENT_TOKEN));
        assertEquals("AWAITING_SIGNER", awaiting.status());
        ClientSigningMaterial material = signatures.clientMaterial(awaiting.orderId());
        assertEquals(1, material.allowedCertificateFingerprints().size());
        byte[] toBeSigned = Base64.getDecoder().decode(material.toBeSigned());

        var foreign = developmentCa.signLocally(otherSigner, toBeSigned);
        SignatureStatus mismatch = signatures.submitClientSignature(awaiting.orderId(),
                new ClientSignature(foreign.signatureValue(), foreign.certificate()));
        assertEquals("FAILED", mismatch.status());
        assertEquals("CA_SIGNER_MISMATCH", mismatch.errorCode());

        EvidenceReceipt second = attest("审方记录二");
        SignatureStatus next = signatures.request(request(second, SigningMode.CLIENT_TOKEN));
        var own = developmentCa.signLocally(signer,
                Base64.getDecoder().decode(signatures.clientMaterial(next.orderId()).toBeSigned()));
        SignatureStatus verified = signatures.submitClientSignature(next.orderId(),
                new ClientSignature(own.signatureValue(), own.certificate()));
        assertEquals("VERIFIED", verified.status());
        assertTrue(verified.trustedTimestamp());
        assertTrue(signatures.verify(next.orderId()).valid());
        assertEquals("SM2_STATEMENT", jdbcTemplate.queryForObject(
                "select SD_SIGN_FMT from RHN_AUD_CRYPTO_EVID where ID_CRYPTO_EVID = ?", String.class,
                verified.evidenceId()));
    }

    @Test
    void only_the_attesting_account_may_request_a_personal_signature() {
        actAs("ca-author");
        EvidenceReceipt attestation = attest("病历");
        actAs("ca-intruder");
        enroll();

        BusinessException exception = assertThrows(BusinessException.class,
                () -> signatures.request(request(attestation, SigningMode.PUSH)));
        assertEquals("CA_SIGNER_NOT_ACTOR", exception.code());
    }

    @Test
    void auto_sign_grant_signs_without_interaction_and_rejected_or_expired_orders_end_cleanly() {
        actAs("ca-auto");
        String signer = enroll();
        developmentCa.grant(signer, Duration.ofHours(4));
        EvidenceReceipt auto = attest("自动签");
        SignatureStatus autoOrder = signatures.request(request(auto, SigningMode.AUTO));
        processor.processNow(autoOrder.orderId());
        assertEquals("VERIFIED", signatures.status(autoOrder.orderId()).status());

        EvidenceReceipt rejected = attest("拒签");
        SignatureStatus rejectedOrder = signatures.request(request(rejected, SigningMode.PUSH));
        processor.processNow(rejectedOrder.orderId());
        developmentCa.reject(rejectedOrder.orderId());
        processor.processNow(rejectedOrder.orderId());
        assertEquals("REJECTED", signatures.status(rejectedOrder.orderId()).status());

        EvidenceReceipt expired = attest("过期");
        SignatureStatus expiredOrder = signatures.request(request(expired, SigningMode.PUSH));
        jdbcTemplate.update("update RHN_AUD_CA_SIGN_ORDER set DT_EXPIRES = DT_CREATED where ID_SIGN_ORDER = ?",
                expiredOrder.orderId());
        processor.processNow(expiredOrder.orderId());
        assertEquals("EXPIRED", signatures.status(expiredOrder.orderId()).status());

        EvidenceReceipt cancelled = attest("取消");
        SignatureStatus cancelledOrder = signatures.request(request(cancelled, SigningMode.QR_CLAIM));
        processor.processNow(cancelledOrder.orderId());
        assertTrue(signatures.status(cancelledOrder.orderId()).claimContent().startsWith("rhn-dev-ca://claim/"));
        assertEquals("CANCELLED", signatures.cancel(cancelledOrder.orderId()).status());

        List<SignatureStatus> statuses = signatures.forAttestations(List.of(auto.evidenceId(), rejected.evidenceId()));
        assertEquals(2, statuses.size());
    }

    @Test
    void development_adapter_is_refused_when_compliance_is_enforced() {
        assertThrows(IllegalStateException.class,
                () -> new CaVendorRegistry(List.of(developmentCa), caProperties, true));
    }

    @Test
    void development_enrollment_and_capability_are_exposed_over_http() throws Exception {
        mockMvc.perform(post("/api/crypto/dev-ca/enrollments").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vendorCode").value("development-ca"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        mockMvc.perform(get("/api/crypto/signatures/capability").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.vendorCode").value("development-ca"))
                .andExpect(jsonPath("$.signers[0].certificateFingerprint").isNotEmpty());
    }

    private Long actAs(String username) {
        Long userId = GlobalIds.next();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                new RhnPrincipal(userId, Long.valueOf(TENANT), username), "", List.of()));
        return userId;
    }

    private String enroll() {
        var context = contextProvider.requireCurrent();
        DevelopmentCaAdapter.Issued issued = developmentCa.issue(context.subjectId(), context.actor());
        signers.bind(context, context.subjectId(), null, DevelopmentCaAdapter.CODE, issued.externalSignerId(),
                CaSignerMedium.MOBILE, issued.certificate());
        return issued.externalSignerId();
    }

    private EvidenceReceipt attest(String content) {
        return evidenceService.protect(new ProtectionRequest(ProtectionProfile.CLINICAL_ACTION_ATTESTATION,
                "CaFlowTestDocument", GlobalIds.next(), 1L, "SIGN", "RHN.TEST.V1", bytes(content),
                Map.of("signatureMeaning", "AUTHOR")));
    }

    private static SignatureRequest request(EvidenceReceipt attestation, SigningMode mode) {
        return new SignatureRequest(attestation.evidenceId(), "OUTPATIENT_NOTE", mode, "门诊病历 TEST", "张*");
    }

    private int countOrders(Long attestationEvidenceId) {
        return jdbcTemplate.queryForObject("select count(*) from RHN_AUD_CA_SIGN_ORDER where ID_CRYPTO_EVID_ATTEST = ?",
                Integer.class, attestationEvidenceId);
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
