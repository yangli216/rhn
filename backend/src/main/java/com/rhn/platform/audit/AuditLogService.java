package com.rhn.platform.audit;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;


@Service
class AuditLogService {
    private final AuditLogRepository repository;

    AuditLogService(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void record(Long tenantId, String actor, String method, String path, int status, String correlationId) {
        repository.save(new AuditLog(tenantId, actor, method, path, status, correlationId));
    }
}

