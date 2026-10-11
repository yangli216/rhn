package com.rhn.platform.numbering.api;

import com.rhn.shared.context.ExecutionContext;

/** Identity of the business owner; a referral uses the target organization/department. */
public record BusinessNumberContext(Long tenantId, Long organizationId, Long departmentId) {
    public static BusinessNumberContext from(ExecutionContext context) {
        return new BusinessNumberContext(context.tenantId(), context.organizationId(), context.departmentId());
    }
}
