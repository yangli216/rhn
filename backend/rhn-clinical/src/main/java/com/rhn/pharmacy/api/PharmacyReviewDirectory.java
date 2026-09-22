package com.rhn.pharmacy.api;

import com.rhn.outpatient.api.MedicationSafetyDecision.Finding;
import java.util.List;

/** Saved pharmacist feedback available within the caller's existing pharmacy scope. */
public interface PharmacyReviewDirectory {
    Source improvementSource(Long taskId, Long reviewId);
    record Source(Long taskId, PharmacyViews.PharmacyReviewView review, List<Finding> findings) {}
}
