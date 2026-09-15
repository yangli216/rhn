package com.rhn.platform.organization.api;

public record OrganizationCatalogSourceView(
        Long organizationId, String organizationName, long organizationRevision,
        Long sourceOrganizationId, String sourceOrganizationName) {
}
