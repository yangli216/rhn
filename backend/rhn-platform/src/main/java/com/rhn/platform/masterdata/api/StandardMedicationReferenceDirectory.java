package com.rhn.platform.masterdata.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

/** Immutable standard identities for knowledge authoring, independent of local medication adoption. */
public interface StandardMedicationReferenceDirectory {
    Reference requireSpecification(String specificationId);
    java.util.List<Reference> exactNameCandidates(String name);
    record Reference(String catalogId, String catalogVersion, String contentHash, String sourceHash,
            String entryId, String specificationId, String name,
            @DictionaryBinding(MasterDataDictionaryCodes.DOSE_FORM) String doseForm,
            String preparationSpec) {}
}
