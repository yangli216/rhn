package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintRequest;
import com.rhn.platform.printing.api.PrintingService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PrescriptionPrintService {
    private final PrescriptionRepository repository;
    private final MedicationRequestService medicationRequestService;
    private final EncounterDirectory encounterDirectory;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final PrintingService printingService;

    PrescriptionPrintService(PrescriptionRepository repository, MedicationRequestService medicationRequestService,
                             EncounterDirectory encounterDirectory, ResidentDirectory residentDirectory,
                             OrganizationDirectory organizationDirectory, PrintingService printingService) {
        this.repository = repository; this.medicationRequestService = medicationRequestService;
        this.encounterDirectory = encounterDirectory; this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory; this.printingService = printingService;
    }

    PrintReceipt print(Long encounterId, Long prescriptionId, String purpose, int copies) {
        EncounterDirectory.EncounterSnapshot encounter = encounterDirectory.requireAccessible(encounterId);
        Prescription prescription = repository.findByIdAndTenantId(prescriptionId, encounter.tenantId())
                .filter(value -> value.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
        if (!"ACTIVE".equals(prescription.status())) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "只有已提交且未撤销的处方可以生成正式打印文件");
        }
        List<MedicationRequest> medications = medicationRequestService.prescriptionRequests(encounter.tenantId(), prescription.id());
        if (medications.isEmpty() || medications.stream().anyMatch(item -> !"ACTIVE".equals(item.status()))) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "处方药品明细尚未全部生效，不能打印");
        }
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(prescription.residentId());
        OrganizationView organization = organizationDirectory.requireOrganization(encounter.tenantId(), prescription.performerOrganizationId());
        DepartmentView department = organizationDirectory.requireDepartment(encounter.tenantId(),
                prescription.performerOrganizationId(), prescription.performerDepartmentId());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", "门诊处方"); snapshot.put("organizationName", organization.name());
        snapshot.put("departmentName", department.name()); snapshot.put("encounterNo", encounter.encounterNo());
        snapshot.put("resident", residentMap(resident)); snapshot.put("prescriptionNo", prescription.groupNo());
        snapshot.put("authoredAt", prescription.authoredAt()); snapshot.put("authoredBy", prescription.authoredBy());
        snapshot.put("submittedAt", prescription.submittedAt()); snapshot.put("submittedBy", prescription.submittedBy());
        snapshot.put("note", prescription.note()); snapshot.put("medications", medicationMaps(medications));
        return printingService.generate(new PrintRequest("Prescription", prescription.id(), prescription.revision(),
                "OUTPATIENT_PRESCRIPTION", prescription.residentId(), prescription.encounterId(),
                prescription.performerOrganizationId(), prescription.performerDepartmentId(), purpose, copies,
                "门诊处方-" + prescription.groupNo() + ".pdf", snapshot));
    }

    private List<Map<String, Object>> medicationMaps(List<MedicationRequest> medications) {
        List<Map<String, Object>> result = new ArrayList<>();
        medications.forEach(item -> {
            Map<String, Object> value = new LinkedHashMap<>(); value.put("medicationName", item.medicationNameSnapshot());
            value.put("medicationCode", item.medicationCodeSnapshot()); value.put("productName", item.localNameSnapshot());
            value.put("specification", item.packageSpecSnapshot() == null ? item.preparationSpecSnapshot() : item.packageSpecSnapshot());
            value.put("quantity", item.quantity()); value.put("quantityUnit", item.quantityUnit());
            value.put("doseValue", item.doseValue()); value.put("doseUnit", item.doseUnit());
            value.put("routeCode", item.routeCode()); value.put("frequencyCode", item.frequencyCode());
            value.put("instruction", item.medicationInstruction()); result.add(value);
        });
        return List.copyOf(result);
    }

    private Map<String, Object> residentMap(ResidentDirectory.ResidentSnapshot resident) {
        Map<String, Object> value = new LinkedHashMap<>(); value.put("id", resident.id());
        value.put("healthRecordNo", resident.healthRecordNo()); value.put("fullName", resident.fullName());
        value.put("gender", resident.gender()); value.put("birthDate", resident.birthDate()); value.put("phone", resident.phone());
        return value;
    }
}
