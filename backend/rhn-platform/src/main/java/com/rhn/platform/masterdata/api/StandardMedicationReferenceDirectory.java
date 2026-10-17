package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

/** Immutable standard identities for knowledge authoring, independent of local medication adoption. */
public interface StandardMedicationReferenceDirectory {
    Reference requireSpecification(String specificationId);
    java.util.List<Reference> exactNameCandidates(String name);
    CategoryReference requireCategory(String categoryKey);
    /** Categories whose name equals the text (ordinal and trailing "类" ignored); never a fuzzy top-N search. */
    java.util.List<CategoryReference> categoryCandidates(String name);
    record CategoryReference(String catalogId, String catalogVersion, String contentHash, String sourceHash,
            String key, String label, java.util.List<String> entryIds) {}
    record Reference(String catalogId, String catalogVersion, String contentHash, String sourceHash,
            String entryId, String specificationId, String name,
            @DictionaryBinding(MasterDataDictionaryCodes.DOSE_FORM) String doseForm,
            String preparationSpec) {}
}
