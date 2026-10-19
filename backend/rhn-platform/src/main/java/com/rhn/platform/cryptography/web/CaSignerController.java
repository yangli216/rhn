package com.rhn.platform.cryptography.web;

import com.rhn.platform.cryptography.api.CaSignerDirectory;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.BindSigner;
import com.rhn.platform.cryptography.api.PersonalSignatureViews.SignerView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Account-to-CA-signer bindings; binding another account is identity administration. */
@RestController
@RequestMapping("/api/crypto/signers")
public class CaSignerController {
    private final CaSignerDirectory directory;

    public CaSignerController(CaSignerDirectory directory) {
        this.directory = directory;
    }

    @GetMapping("/me")
    List<SignerView> myCaSigners() {
        return directory.mine();
    }

    @GetMapping
    @PreAuthorize("hasAuthority(T(com.rhn.platform.identityaccess.api.IdentityAccessPermissions).MANAGE)")
    List<SignerView> caSignersForUser(@RequestParam Long userId) {
        return directory.forUser(userId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority(T(com.rhn.platform.identityaccess.api.IdentityAccessPermissions).MANAGE)")
    SignerView bindCaSigner(@Valid @RequestBody BindSignerRequest request) {
        return directory.bind(new BindSigner(request.userId(), request.practitionerId(), request.vendorCode(),
                request.externalSignerId(), request.medium(), request.certificate()));
    }

    @PostMapping("/{signerId}/status")
    @PreAuthorize("hasAuthority(T(com.rhn.platform.identityaccess.api.IdentityAccessPermissions).MANAGE)")
    SignerView changeCaSignerStatus(@PathVariable Long signerId, @Valid @RequestBody ChangeStatusRequest request) {
        return directory.changeStatus(signerId, request.expectedRevision(), request.status());
    }

    record BindSignerRequest(@NotNull Long userId, Long practitionerId, @NotBlank @Size(max = 32) String vendorCode,
                             @NotBlank @Size(max = 128) String externalSignerId,
                             @NotBlank @Size(max = 16) String medium, @Size(max = 16384) String certificate) {}

    record ChangeStatusRequest(@PositiveOrZero long expectedRevision, @NotBlank @Size(max = 16) String status) {}
}
