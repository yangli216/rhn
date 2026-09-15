package com.rhn.healthcore.allergy;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record InactivateAllergyRequest(long expectedRevision, @NotBlank @Size(max = 1000) String reason) {}
