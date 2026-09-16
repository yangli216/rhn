package com.rhn.platform.masterdata.api;

import java.util.List;

/** Each owning module reports its own facts; Platform never queries another module's tables. */
public interface ClinicalSemanticImpactContributor {
    Impact describe(String kind, String conceptId);
    record Impact(String area, String coverage, Long activeCount, List<String> references,
                  boolean ruleRetestRequired, String note) {
        public Impact { references = List.copyOf(references); }
    }
}
