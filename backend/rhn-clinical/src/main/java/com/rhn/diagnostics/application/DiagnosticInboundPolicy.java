package com.rhn.diagnostics.application;

import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class DiagnosticInboundPolicy {
    private final ConfigurationDirectory configuration;
    public DiagnosticInboundPolicy(ConfigurationDirectory configuration) { this.configuration = configuration; }
    public void requireEndpointAccess(ExecutionContext context, String endpoint) {
        for (String type : new String[]{"LABORATORY", "EXAMINATION"}) {
            String kind = "LABORATORY".equals(type) ? "laboratory" : "examination";
            var resolved = configuration.resolveCurrent(context.tenantId(), context.subjectId(), context.organizationId(), null,
                    "diagnostics." + kind + ".inbound-endpoints");
            if (resolved != null && resolved.value() != null && resolved.value().isArray()) {
                for (var value : resolved.value()) if (value.isString() && value.asString().equals(endpoint)) {
                    requireTrusted(context, context.organizationId(), type, endpoint);
                    return;
                }
            }
        }
        throw forbidden("DIAGNOSTIC_ENDPOINT_SOURCE_MISMATCH", "端点不在当前机构医技交换白名单中");
    }
    public void requireTrusted(ExecutionContext context, Long organizationId, String serviceType, String endpoint) {
        if("RHN-LOCAL".equalsIgnoreCase(endpoint)) throw forbidden("DIAGNOSTIC_LOCAL_ENDPOINT_RESERVED","本地报告必须从工作台签发");
        String kind = "LABORATORY".equals(serviceType) ? "laboratory" : "examination";
        String category = "LABORATORY".equals(serviceType) ? "LIS" : "PACS";
        com.rhn.diagnostics.api.DiagnosticPermissions.require(context,"INTEGRATION",category);
        var resolved = configuration.resolveCurrent(context.tenantId(),context.subjectId(),organizationId,null,
                "diagnostics." + kind + ".inbound-endpoints");
        if(resolved != null && resolved.value() != null && resolved.value().isArray()) {
            for(var value : resolved.value()) if(value.isString() && value.asString().equals(endpoint)) return;
        }
        throw forbidden("DIAGNOSTIC_ENDPOINT_SOURCE_MISMATCH","此外部端点不在当前机构的授权类别白名单中");
    }
}
