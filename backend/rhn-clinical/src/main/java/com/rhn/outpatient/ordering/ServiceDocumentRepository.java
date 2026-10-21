package com.rhn.outpatient.ordering;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

interface ServiceDocumentRepository extends JpaRepository<ServiceDocument, Long> {
    List<ServiceDocument> findByTenantIdAndIdIn(Long tenantId, Collection<Long> ids);
}
