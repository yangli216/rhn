package com.rhn.billing.api;

import java.util.List;
import java.util.Map;

/** Provider-owned administration metadata and local credential validation; never performs a payment. */
public interface PaymentChannelConfigurationAdapter {
    PaymentConfigurationDescriptor configurationDescriptor();
    Map<String, String> deploymentConfiguration(Long tenantId, Long organizationId);
    void checkConfiguration(Map<String, String> values);

    record PaymentConfigurationDescriptor(@com.rhn.platform.dictionary.api.DictionaryBinding("PAY_METHOD") String paymentMethodCode, String adapterCode, String name,
                                          List<PaymentConfigurationField> fields) {
        public PaymentConfigurationDescriptor { fields = List.copyOf(fields); }
    }
    record PaymentConfigurationOption(String value, String label) {}
    record PaymentConfigurationField(String key, String label, String control, boolean required,
                                      boolean secret, boolean identity, String accept, String encoding,
                                      List<PaymentConfigurationOption> options,
                                      String visibleWhenField, String visibleWhenValue) {
        public PaymentConfigurationField { options = options == null ? List.of() : List.copyOf(options); }
    }
}
