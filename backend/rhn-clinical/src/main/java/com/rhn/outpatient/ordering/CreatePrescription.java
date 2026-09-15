package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.Size;

record CreatePrescription(
        @Size(max = 64) String categoryCode,
        Long performerOrganizationId,
        Long performerDepartmentId,
        @Size(max = 2000) String note) {}
