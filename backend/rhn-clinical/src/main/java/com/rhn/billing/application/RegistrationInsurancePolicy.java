package com.rhn.billing.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;

/**
 * 挂号医保结算时机：由参数 {@code billing.registration.insurance-settlement} 按机构／科室维护。
 * 缺值或非法值一律按“诊间统一结算”处理，避免在未明确启用时于挂号环节发起外部医保交易。
 */
@Service
public class RegistrationInsurancePolicy {
    public static final String PARAMETER_KEY = "billing.registration.insurance-settlement";

    public enum Timing { REGISTRATION, VISIT_UNIFIED }

    private final ConfigurationDirectory configuration;

    public RegistrationInsurancePolicy(ConfigurationDirectory configuration) { this.configuration = configuration; }

    public Timing timing(ExecutionContext context, Long organizationId, Long departmentId) {
        var configured = configuration.resolveCurrent(context.tenantId(), context.subjectId(),
                organizationId, departmentId, PARAMETER_KEY);
        if (configured == null || configured.value() == null) return Timing.VISIT_UNIFIED;
        String value = configured.value().path("timing").asString("");
        return "REGISTRATION".equals(value) ? Timing.REGISTRATION : Timing.VISIT_UNIFIED;
    }
}
