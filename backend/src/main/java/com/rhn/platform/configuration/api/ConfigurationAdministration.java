package com.rhn.platform.configuration.api;

import java.util.Optional;

/** Public administration port for modules that own governed configuration namespaces. */
public interface ConfigurationAdministration {
    Optional<ManagedValue> findValue(String key, String scopeCode);

    void saveValue(String key, ManagedValueCommand command);

    enum Scope {
        PLATFORM, TENANT
    }

    enum ValueMode {
        OVERRIDE, INHERIT
    }

    record ManagedValue(
            String valueJson,
            String secretReference,
            ValueMode valueMode,
            boolean active,
            long revision) {
    }

    record ManagedValueCommand(
            Long expectedRevision,
            Scope scope,
            Long scopeId,
            ValueMode valueMode,
            String valueJson,
            String secretReference,
            String reason,
            String requestCode) {
    }
}
