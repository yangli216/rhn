package com.rhn.diagnostics.api;

public final class DiagnosticPermissions {
    private DiagnosticPermissions() {}
    public static final String ACCESS = "hasAnyAuthority('DIAGNOSTICS.ACCESS','ROLE_ADMIN')";
    public static final String INTEGRATION = "hasAnyAuthority('DIAGNOSTICS.INTEGRATION.LIS','DIAGNOSTICS.INTEGRATION.PACS','ROLE_ADMIN')";

    public static boolean canRead(com.rhn.shared.context.ExecutionContext context, String category) {
        return context.hasAuthority("ROLE_ADMIN") || java.util.stream.Stream.of("VIEW", "EXECUTE", "EDIT", "SIGN")
                .anyMatch(action -> context.hasAuthority("DIAGNOSTICS." + category + "." + action));
    }
    public static void requireRead(com.rhn.shared.context.ExecutionContext context, String category) {
        if (!canRead(context, category))
            throw com.rhn.shared.api.BusinessErrors.forbidden("DIAGNOSTIC_CATEGORY_FORBIDDEN", "当前账号未获授权访问此类医技作业");
    }

    public static void require(com.rhn.shared.context.ExecutionContext context, String category, String action) {
        if (!context.hasAuthority("ROLE_ADMIN") && !context.hasAuthority("DIAGNOSTICS." + category + "." + action))
            throw com.rhn.shared.api.BusinessErrors.forbidden("DIAGNOSTIC_ACTION_FORBIDDEN", "当前账号未获授权执行此医技操作");
    }
}
