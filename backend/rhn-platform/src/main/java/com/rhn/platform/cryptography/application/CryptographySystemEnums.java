package com.rhn.platform.cryptography.application;

import com.rhn.platform.cryptography.domain.CaSignerMedium;
import com.rhn.platform.cryptography.domain.CaSignerStatus;
import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/** CA signer value sets; screens read their names here instead of keeping Chinese copies. */
@Component
class CryptographySystemEnums implements SystemEnumContribution {
    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(
                of("SYS_CA_SIGNER_MEDIUM", "CA 证书介质", "CA 签名人证书所在的介质", CaSignerMedium.class, items(
                        "MOBILE", "手机证书", "手机端协同签名证书", "UKEY", "UKey", "USB 硬件证书")),
                of("SYS_CA_SIGNER_STATUS", "CA 签名人状态", "账号与 CA 签名人身份的绑定状态", CaSignerStatus.class, items(
                        "ACTIVE", "有效", "可用于登录与签名", "SUSPENDED", "已暂停", "暂停使用，可恢复",
                        "REVOKED", "已作废", "证书已作废，不可恢复", "UNBOUND", "已解绑", "账号已解除绑定")));
    }
}
