package com.rhn.platform.security;

final class WorkContextRequest {
    private static final ThreadLocal<Selection> CURRENT = new ThreadLocal<>();

    private WorkContextRequest() {
    }

    static void set(Long organizationId, Long departmentId) {
        CURRENT.set(new Selection(organizationId, departmentId));
    }

    static Selection current() {
        return CURRENT.get();
    }

    static void clear() {
        CURRENT.remove();
    }

    record Selection(Long organizationId, Long departmentId) {
    }
}
