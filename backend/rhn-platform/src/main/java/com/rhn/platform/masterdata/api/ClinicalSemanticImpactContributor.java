package com.rhn.platform.masterdata.api;

import java.util.List;

/** Each owning module reports its own facts; Platform never queries another module's tables. */
public interface ClinicalSemanticImpactContributor {
    Impact describe(String kind, String conceptId);
    default DetailImpact detail(String kind, String conceptId) { return new DetailImpact(describe(kind,conceptId), List.of()); }
    record Reference(String location, String conceptId, String code, String system, String version, String fingerprint, String note) {}
    record Dependency(String kind, String id, String parentId, String name, String version, String status,
            boolean historical, String relation, List<Reference> references) {
        public Dependency {references=List.copyOf(references);}
    }
    record DetailImpact(Impact summary, List<Dependency> dependencies) {
        public DetailImpact {dependencies=List.copyOf(dependencies);}
    }
    record Impact(String area, String coverage, Long activeCount, List<String> references,
                  boolean ruleRetestRequired, String note) {
        public Impact { references = List.copyOf(references); }
    }
}
