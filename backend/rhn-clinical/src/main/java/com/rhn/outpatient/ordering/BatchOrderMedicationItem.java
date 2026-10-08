package com.rhn.outpatient.ordering;

import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record BatchOrderMedicationItem(
        Long medicationId,
        Long catalogItemId,
        Long packageId,
        @DecimalMin(value = "0", inclusive = false) BigDecimal doseValue,
        @Size(max = 64) String doseUnit,
        @Size(max = 64) String routeCode,
        @Size(max = 64) String frequencyCode,
        @DecimalMin(value = "0", inclusive = false) BigDecimal durationValue,
        @Size(max = 32) String durationUnit,
        @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
        @Size(max = 64) String quantityUnit,
        boolean substitutionAllowed,
        boolean selfProvided,
        @Size(max = 1000) String medicationInstruction,
        Boolean allergyReviewConfirmed,
        @Size(max = 1000) String allergyOverrideReason,
        @DictionaryBinding(MasterDataDictionaryCodes.PRICE_TYPE) @Size(max = 32) String priceType,
        Boolean pricingRequired,
        Long stockSiteId,
        @Size(max = 128) String stockSiteName,
        @Size(max = 128) String administrationGroupKey,
        @Size(max = 32) String routeExecutionType,
        @Size(max = 32) String categoryCode,
        Boolean skinTestExempt,
        @Size(max = 500) String skinTestExemptReason,
        Long exemptEvidenceEventId,
        @Size(max = 1000) String reason
) {
    BatchOrderMedicationItem withResolvedFacts(Long verifiedMedicationId, String verifiedCategory, String verifiedRoute,
                                              String verifiedExecutionType, Long verifiedSiteId, String verifiedSiteName) {
        return new BatchOrderMedicationItem(verifiedMedicationId, catalogItemId, packageId, doseValue, doseUnit,
                verifiedRoute, frequencyCode, durationValue, durationUnit, quantity, quantityUnit,
                substitutionAllowed, selfProvided, medicationInstruction, allergyReviewConfirmed, allergyOverrideReason,
                priceType, pricingRequired, verifiedSiteId, verifiedSiteName, administrationGroupKey,
                verifiedExecutionType, verifiedCategory, skinTestExempt, skinTestExemptReason, exemptEvidenceEventId, reason);
    }
}
