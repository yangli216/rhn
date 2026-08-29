package com.rhn.platform.identityaccess.api;

/**
 * Stable business slot for work contexts. Multiple slots may be active for one user, while a slot
 * has exactly one selected department in the client execution state.
 */
public enum WorkContextType {
    CLINICAL,
    PHARMACY,
    INVENTORY,
    GENERAL
}
