package com.rhn.billing.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** Billing codes whose values live in dictionaries or system enums rather than in code. */
@Component
class BillingCodes {
    static final String PAYMENT_SCENE = "PAY_USE_SCENE";
    static final String PAYMENT_METHOD = "PAY_METHOD";
    static final String TENDER_TYPE = "TENDER_TYPE";
    static final String DEFAULT_PAYMENT_SCENE = "CASHIER";

    private final DictionaryDirectory dictionaries;
    private final SystemEnumDirectory systemEnums;

    BillingCodes(DictionaryDirectory dictionaries, SystemEnumDirectory systemEnums) {
        this.dictionaries = dictionaries; this.systemEnums = systemEnums;
    }

    /** Where the charge is collected; blank means the cashier window. */
    String paymentScene(Long tenantId, String value) {
        String scene = upper(value, DEFAULT_PAYMENT_SCENE);
        if (dictionaries.resolveActiveItems(tenantId, PAYMENT_SCENE).stream().noneMatch(item -> item.code().equals(scene))) {
            throw badRequest("PAYMENT_SCENE_INVALID", "收费入口不存在或未启用");
        }
        return scene;
    }

    String settlementScene(String value, String fallback) {
        String scene = upper(value, fallback);
        if (!systemEnums.contains(BillingSystemEnums.SETTLEMENT_SCENE, scene)) {
            throw badRequest("SETTLEMENT_SCENE_INVALID", "结算场景不正确");
        }
        return scene;
    }

    String receiptType(String value) {
        String type = upper(value, null);
        if (!systemEnums.contains(BillingSystemEnums.RECEIPT_TYPE, type)) throw badRequest("RECEIPT_TYPE_INVALID", "票据类型不正确");
        return type;
    }

    /** Tender type configured on the payment method; payments are refused when it is missing. */
    String requireTenderType(Long tenantId, String paymentMethod) {
        return tenderType(tenantId, paymentMethod).orElseThrow(() -> conflict(
                "PAYMENT_METHOD_TENDER_TYPE_MISSING", "支付方式未配置结算支付类别，请在支付方式字典中维护"));
    }

    Optional<String> tenderType(Long tenantId, String paymentMethod) {
        return dictionaries.resolveActiveItems(tenantId, PAYMENT_METHOD).stream()
                .filter(item -> item.code().equals(paymentMethod))
                .map(item -> Strings.trimToNull(item.attributes().get(TENDER_TYPE)))
                .filter(type -> type != null && systemEnums.contains(BillingSystemEnums.TENDER_TYPE, type))
                .findFirst();
    }

    private static String upper(String value, String fallback) {
        String trimmed = Strings.trimToNull(value);
        return trimmed == null ? fallback : trimmed.toUpperCase(Locale.ROOT);
    }
}
