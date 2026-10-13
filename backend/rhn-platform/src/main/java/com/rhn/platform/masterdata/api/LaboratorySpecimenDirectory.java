package com.rhn.platform.masterdata.api;

import java.util.List;

/** Reuses the catalog's maintained sharing/container rules for actual collection. */
public interface LaboratorySpecimenDirectory {
    MedicalOperationsViews.LaboratoryTubePlan laboratoryTubePlan(
            List<MedicalOperationsCommands.LaboratoryOrderItemCommand> items);
}
