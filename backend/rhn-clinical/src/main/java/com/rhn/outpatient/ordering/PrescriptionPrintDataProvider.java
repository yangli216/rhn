package com.rhn.outpatient.ordering;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintDataProvider;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintDataSnapshot;
import com.rhn.platform.printing.api.PrintTaskCodes;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PrescriptionPrintDataProvider implements PrintDataProvider {
    private final OrderDocumentInfoSupport documentInfoSupport;
    private final PrescriptionRepository repository;
    private final MedicationRequestService medications;
    private final EncounterDirectory encounters;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;

    PrescriptionPrintDataProvider(PrescriptionRepository repository, MedicationRequestService medications,
                                  EncounterDirectory encounters, ResidentDirectory residents,
                                  OrganizationDirectory organizations, OrderDocumentInfoSupport documentInfoSupport) {
        this.documentInfoSupport = documentInfoSupport;
        this.repository = repository; this.medications = medications; this.encounters = encounters;
        this.residents = residents; this.organizations = organizations;
    }

    @Override public String providerCode() { return "PRESCRIPTION"; }

    @Override
    public PrintDataSnapshot load(PrintDataRequest request) {
        if (!PrintTaskCodes.OUTPATIENT_WESTERN_PRESCRIPTION.equals(request.taskCode())) {
            throw conflict("PRINT_TASK_SOURCE_MISMATCH", "处方数据提供器不支持当前打印任务");
        }
        if (request.source().encounterId() == null) {
            throw conflict("PRINT_ENCOUNTER_REQUIRED", "处方打印必须提供就诊标识");
        }
        EncounterDirectory.EncounterSnapshot encounter = encounters.requireAccessible(request.source().encounterId());
        Prescription prescription = repository.findByIdAndTenantId(request.source().sourceId(), encounter.tenantId())
                .filter(value -> value.encounterId().equals(encounter.id()))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
        if (!"ACTIVE".equals(prescription.status())) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "只有已提交且未撤销的处方可以生成正式打印文件");
        }
        List<MedicationRequest> items = medications.prescriptionRequests(encounter.tenantId(), prescription.id());
        if (items.isEmpty() || items.stream().anyMatch(item -> !"ACTIVE".equals(item.status()))) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "处方药品明细尚未全部生效，不能打印");
        }
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(prescription.residentId());
        OrganizationView organization = organizations.requireOrganization(encounter.tenantId(), prescription.performerOrganizationId());
        DepartmentView department = organizations.requireDepartment(encounter.tenantId(),
                prescription.performerOrganizationId(), prescription.performerDepartmentId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", "门诊处方"); payload.put("organizationName", organization.name());
        payload.put("departmentName", department.name()); payload.put("encounterNo", encounter.encounterNo());
        payload.put("resident", residentMap(resident)); payload.put("prescriptionNo", prescription.groupNo());
        payload.put("authoredAt", prescription.authoredAt()); payload.put("authoredBy", prescription.authoredBy());
        payload.put("submittedAt", prescription.submittedAt()); payload.put("submittedBy", prescription.submittedBy());
        payload.put("documentInfo", documentInfoSupport.read(prescription.documentInfoJson()));
        payload.put("note", documentInfoSupport.appendSummary(prescription.note(), prescription.documentInfoJson())); payload.put("medications", medicationMaps(items));
        return new PrintDataSnapshot("Prescription", prescription.id(), prescription.revision(),
                prescription.residentId(), prescription.encounterId(), prescription.performerOrganizationId(),
                prescription.performerDepartmentId(), "门诊处方-" + prescription.groupNo() + ".pdf", payload);
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
