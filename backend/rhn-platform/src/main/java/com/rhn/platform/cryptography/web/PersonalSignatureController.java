package com.rhn.platform.cryptography.web;

import com.rhn.platform.cryptography.api.EvidenceVerification;
import com.rhn.platform.cryptography.api.PersonalSignatureService;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSignature;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.ClientSigningMaterial;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureRequest;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignatureStatus;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SigningCapability;
import com.rhn.platform.cryptography.api.SigningMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Optional personal CA signatures; every order is owned by and visible to its signer only. */
@RestController
@RequestMapping("/api/crypto/signatures")
public class PersonalSignatureController {
    private final PersonalSignatureService service;

    public PersonalSignatureController(PersonalSignatureService service) {
        this.service = service;
    }

    @GetMapping("/capability")
    SigningCapability personalSigningCapability() {
        return service.capability();
    }

    @PostMapping
    SignatureStatus requestPersonalSignature(@Valid @RequestBody CreateSignatureRequest request) {
        return service.request(new SignatureRequest(request.attestationEvidenceId(), request.sceneCode(),
                request.mode(), request.subject(), request.patientDisplay()));
    }

    @GetMapping
    List<SignatureStatus> personalSignaturesForAttestations(@RequestParam List<Long> attestationEvidenceIds) {
        return service.forAttestations(attestationEvidenceIds);
    }

    @GetMapping("/{orderId}")
    SignatureStatus personalSignatureStatus(@PathVariable Long orderId) {
        return service.status(orderId);
    }

    @GetMapping("/{orderId}/client-material")
    ClientSigningMaterial personalSignatureClientMaterial(@PathVariable Long orderId) {
        return service.clientMaterial(orderId);
    }

    @PostMapping("/{orderId}/client-signature")
    SignatureStatus submitPersonalClientSignature(@PathVariable Long orderId,
                                          @Valid @RequestBody ClientSignatureRequest request) {
        return service.submitClientSignature(orderId, new ClientSignature(request.signatureValue(),
                request.certificate()));
    }

    @PostMapping("/{orderId}/cancel")
    SignatureStatus cancelPersonalSignature(@PathVariable Long orderId) {
        return service.cancel(orderId);
    }

    @GetMapping("/{orderId}/verification")
    EvidenceVerification verifyPersonalSignature(@PathVariable Long orderId) {
        return service.verify(orderId);
    }

    record CreateSignatureRequest(@NotNull Long attestationEvidenceId, @NotBlank @Size(max = 64) String sceneCode,
                                  SigningMode mode, @NotBlank @Size(max = 200) String subject,
                                  @Size(max = 64) String patientDisplay) {}

    record ClientSignatureRequest(@NotBlank @Size(max = 4096) String signatureValue,
                                  @NotBlank @Size(max = 16384) String certificate) {}
}
