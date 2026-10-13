package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.Operation;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Component
public class MaintenanceEnvironmentPolicy {
    private final Environment environment;
    public MaintenanceEnvironmentPolicy(Environment environment) { this.environment = environment; }
    public boolean physicalCleanupEnabled() {
        return environment.getProperty("rhn.maintenance.physical-cleanup-enabled", Boolean.class,
                environment.acceptsProfiles(Profiles.of("test", "local", "oracle-local")));
    }
    public String environmentName() {
        return environment.getActiveProfiles().length == 0 ? "默认环境" : String.join(" / ", environment.getActiveProfiles());
    }
    public void requireOperation(Operation operation) {
        if ((operation == Operation.CLEAN_TEST || operation == Operation.RESET_PRELIVE) && !physicalCleanupEnabled())
            throw forbidden("MAINTENANCE_ENVIRONMENT_DISABLED", "当前环境尚未开放物理清理");
    }
}
