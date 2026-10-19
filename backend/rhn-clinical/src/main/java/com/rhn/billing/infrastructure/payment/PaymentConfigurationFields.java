package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentChannelConfigurationAdapter.*;
import java.util.List;

final class PaymentConfigurationFields {
    private PaymentConfigurationFields() {}
    static PaymentConfigurationField text(String key, String label, boolean identity) {
        return new PaymentConfigurationField(key,label,"TEXT",true,false,identity,null,null,List.of(),null,null);
    }
    static PaymentConfigurationField password(String key, String label) {
        return new PaymentConfigurationField(key,label,"PASSWORD",true,true,false,null,null,List.of(),null,null);
    }
    static PaymentConfigurationField file(String key, String label, String accept, String encoding, String mode) {
        return new PaymentConfigurationField(key,label,"FILE",true,true,false,accept,encoding,List.of(),mode == null ? null : "keyMode",mode);
    }
    static PaymentConfigurationField choice(String key, String label, boolean identity, PaymentConfigurationOption... options) {
        return new PaymentConfigurationField(key,label,"CHOICE",true,false,identity,null,null,List.of(options),null,null);
    }
}
