package com.rhn.platform.identityaccess.api;


public record UserAccountReference(Long id, Long tenantId, Long practitionerId, String username, String status) {
}
