package com.rhn.billing.api;

import java.util.regex.Pattern;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Protocol-independent capabilities. Only interactions implemented by the shared cashier are advertised. */
public record PaymentChannelCapabilities(String adapterCode, PaymentInteraction interaction,
                                         PaymentAuthorizationCodeRule authorizationCodeRule,
                                         boolean querySupported, boolean refundSupported,
                                         boolean confirmBeforeCancel) {
    public enum PaymentInteraction { DIRECT, AUTHORIZATION_CODE }

    public PaymentChannelCapabilities {
        if (adapterCode == null || adapterCode.isBlank() || interaction == null
                || (interaction == PaymentInteraction.AUTHORIZATION_CODE) != (authorizationCodeRule != null)
                || confirmBeforeCancel && !querySupported) {
            throw new IllegalArgumentException("支付渠道能力声明不完整或矛盾");
        }
    }

    public record PaymentAuthorizationCodeRule(String pattern, int minLength, int maxLength) {
        public PaymentAuthorizationCodeRule {
            if (pattern == null || pattern.length() > 256 || minLength < 1 || maxLength < minLength || maxLength > 32) {
                throw new IllegalArgumentException("支付渠道付款码规则无效");
            }
            Pattern.compile(pattern);
        }
    }

    public void validateAuthorizationCode(String code) {
        if (interaction == PaymentInteraction.DIRECT) {
            if (code != null && !code.isBlank()) throw badRequest("PAYMENT_AUTHORIZATION_CODE_UNSUPPORTED", "当前支付渠道不接收患者付款码");
        } else if (code == null || code.length() < authorizationCodeRule.minLength()
                || code.length() > authorizationCodeRule.maxLength()
                || !Pattern.matches(authorizationCodeRule.pattern(), code)) {
            throw badRequest("PAYMENT_AUTHORIZATION_CODE_INVALID", "请扫描所选支付方式的有效患者付款码");
        }
    }
}
