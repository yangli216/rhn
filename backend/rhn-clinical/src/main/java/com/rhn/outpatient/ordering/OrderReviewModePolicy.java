package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.springframework.stereotype.Service;

import java.util.Locale;

/**
 * 门诊医嘱开立核查模式：STANDARD 每次开立先弹出核查窗确认分单、诊断和合理用药；
 * SIMPLE 直接开立，仅在合理用药需要确认或开立失败时弹出核查窗。两种模式都走同一个后端提交命令和全部安全门禁。
 */
@Service
public class OrderReviewModePolicy {
    public static final String PARAMETER_KEY = "outpatient.doctor-workstation.order-review-mode";

    public enum Mode { SIMPLE, STANDARD }

    private final ConfigurationDirectory configuration;

    public OrderReviewModePolicy(ConfigurationDirectory configuration) {
        this.configuration = configuration;
    }

    Mode resolve(EncounterSnapshot encounter) {
        var configured = configuration.resolveCurrent(encounter.tenantId(), null, encounter.organizationId(),
                encounter.departmentId(), PARAMETER_KEY);
        if (configured == null || configured.value() == null || !configured.value().isString()) return Mode.STANDARD;
        try {
            return Mode.valueOf(configured.value().asString().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ignored) {
            // 非法取值已由参数平台拒绝写入；历史脏数据按标准模式处理。
            return Mode.STANDARD;
        }
    }
}
