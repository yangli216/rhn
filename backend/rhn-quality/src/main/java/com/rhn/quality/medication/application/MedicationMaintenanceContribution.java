package com.rhn.quality.medication.application;

import com.rhn.platform.maintenance.api.ClinicalMaintenanceSupport;
import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Set;

@Component
public class MedicationMaintenanceContribution extends ClinicalMaintenanceSupport {
    public MedicationMaintenanceContribution() {
        super("MEDICATION_AUDIT", List.of(new TableDefinition("RHN_AUD_MED_EVAL", "ID_EVAL",
                "OUTPATIENT", "合理用药判断留痕", true, Set.of("ID_ENC"))));
    }
}
