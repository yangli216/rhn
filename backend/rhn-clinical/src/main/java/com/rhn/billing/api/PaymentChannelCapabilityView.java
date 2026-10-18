package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

/** Public capability metadata only; never contains credentials, merchant IDs or filesystem paths. */
public record PaymentChannelCapabilityView(@DictionaryBinding("PAY_METHOD") String paymentMethodCode,
                                           boolean available, PaymentChannelCapabilities capabilities,
                                           String unavailableReason) {}
