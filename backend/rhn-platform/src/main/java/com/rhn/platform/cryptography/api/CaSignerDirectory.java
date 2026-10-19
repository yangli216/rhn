package com.rhn.platform.cryptography.api;

import java.util.List;

/** Account-to-CA-signer bindings. Administrative methods require {@code IAM.MANAGE} at the web boundary. */
public interface CaSignerDirectory {
    List<PersonalSignatureViews.SignerView> mine();

    List<PersonalSignatureViews.SignerView> forUser(Long userId);

    PersonalSignatureViews.SignerView bind(PersonalSignatureViews.BindSigner command);

    PersonalSignatureViews.SignerView changeStatus(Long signerId, long expectedRevision, String status);
}
