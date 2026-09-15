package com.rhn.platform.masterdata.api;

import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;

/**
 * Public business-module contract for resolving immutable item-attribute facts.
 * Business modules persist the returned snapshot, hash and resolved time together.
 */
public interface ItemAttributeSnapshotDirectory {
    ItemAttributeSnapshot resolveSnapshot(String subjectType, Long targetId, LocalDate businessDate,
                                          AttributeContexts contexts);

    record AttributeScope(Long organizationId, Long departmentId) {}

    record AttributeContexts(AttributeScope ordering, AttributeScope executing,
                             AttributeScope dispensing, AttributeScope stocking) {}

    record ItemAttributeSnapshot(Long subjectId, String subjectType, Long targetId, Long itemTypeId,
                                 LocalDate businessDate, Instant resolvedAt,
                                 JsonNode jsonItemAttrSnapshot, String hashItemAttrSnapshot) {}
}
