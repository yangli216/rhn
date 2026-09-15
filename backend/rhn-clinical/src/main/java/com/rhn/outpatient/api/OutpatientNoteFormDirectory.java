package com.rhn.outpatient.api;

import java.util.Map;

/** Resolves and validates a published outpatient note form before its immutable snapshot enters a clinical document. */
public interface OutpatientNoteFormDirectory {
    ResolvedForm resolvePublished(Long versionId, Map<String, Object> values);

    record ResolvedForm(Map<String, Object> definitionSnapshot, Map<String, Object> normalizedValues) {}
}
