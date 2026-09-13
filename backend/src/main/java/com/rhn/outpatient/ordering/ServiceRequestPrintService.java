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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ServiceRequestPrintService {
    private final ServiceRequestRepository repository;
    private final EncounterDirectory encounterDirectory;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final PrintingService printingService;

    ServiceRequestPrintService(ServiceRequestRepository repository, EncounterDirectory encounterDirectory,
                               ResidentDirectory residentDirectory, OrganizationDirectory organizationDirectory,
                               PrintingService printingService) {
        this.repository = repository;
        this.encounterDirectory = encounterDirectory;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.printingService = printingService;
    }

    PrintReceipt print(Long encounterId, Long requestId, String purpose, int copies) {
        EncounterDirectory.EncounterSnapshot encounter = encounterDirectory.requireAccessible(encounterId);
        ServiceRequest request = repository.findByIdAndTenantId(requestId, encounter.tenantId())
                .filter(value -> value.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到当前就诊的诊疗申请"));
        if (!"ACTIVE".equals(request.status())) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "只有已生效且未撤销的诊疗申请可以生成正式打印文件");
        }

        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(request.residentId());
        OrganizationView organization = organizationDirectory.requireOrganization(
                encounter.tenantId(), request.performerOrganizationId());
        DepartmentView department = organizationDirectory.requireDepartment(encounter.tenantId(),
                request.performerOrganizationId(), request.performerDepartmentId());
        String documentType = documentType(request.serviceTypeSnapshot());
        String documentName = documentName(request.serviceTypeSnapshot());

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", documentName);
        snapshot.put("organizationName", organization.name());
        snapshot.put("departmentName", department.name());
        snapshot.put("encounterNo", encounter.encounterNo());
        snapshot.put("resident", residentMap(resident));
        snapshot.put("requestNo", request.requestNo());
        snapshot.put("serviceType", request.serviceTypeSnapshot());
        snapshot.put("serviceTypeText", serviceTypeText(request.serviceTypeSnapshot()));
        snapshot.put("itemCode", request.itemCodeSnapshot());
        snapshot.put("itemName", request.itemNameSnapshot());
        snapshot.put("localCode", request.localCodeSnapshot());
        snapshot.put("localName", request.localNameSnapshot());
        snapshot.put("quantityText", request.quantity().stripTrailingZeros().toPlainString()
                + " " + request.unitCodeSnapshot());
        snapshot.put("specimenType", valueOrDash(request.specimenTypeSnapshot()));
        snapshot.put("examinationType", valueOrDash(request.examinationTypeSnapshot()));
        snapshot.put("clinicalDescription", valueOrDash(request.clinicalDescription()));
        snapshot.put("reason", valueOrDash(request.reasonText()));
        snapshot.put("authoredAt", request.authoredAt());
        snapshot.put("authoredBy", request.authoredBy());
        snapshot.put("businessDate", request.businessDate());
        snapshot.put("items", List.of(Map.of(
                "itemCode", request.itemCodeSnapshot(),
                "itemName", request.itemNameSnapshot(),
                "quantityText", request.quantity().stripTrailingZeros().toPlainString()
                        + " " + request.unitCodeSnapshot(),
                "clinicalDescription", valueOrDash(request.clinicalDescription()))));

        return printingService.generate(new PrintRequest("ServiceRequest", request.id(), request.revision(),
                documentType, request.residentId(), request.encounterId(), request.performerOrganizationId(),
                request.performerDepartmentId(), purpose, copies,
                documentName + "-" + request.requestNo() + ".pdf", snapshot));
    }

    private String documentType(String serviceType) {
        return switch (serviceType == null ? "OTHER" : serviceType) {
            case "LABORATORY" -> "LABORATORY_APPLICATION";
            case "EXAMINATION" -> "EXAMINATION_APPLICATION";
            default -> "TREATMENT_APPLICATION";
        };
    }

    private String documentName(String serviceType) {
        return switch (serviceType == null ? "OTHER" : serviceType) {
            case "LABORATORY" -> "检验申请单";
            case "EXAMINATION" -> "检查申请单";
            default -> "治疗申请单";
        };
    }

    private String serviceTypeText(String serviceType) {
        return switch (serviceType == null ? "OTHER" : serviceType) {
            case "LABORATORY" -> "检验";
            case "EXAMINATION" -> "检查";
            case "TREATMENT" -> "治疗";
            default -> "其他诊疗";
        };
    }

    private Map<String, Object> residentMap(ResidentDirectory.ResidentSnapshot resident) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", resident.id());
        value.put("healthRecordNo", resident.healthRecordNo());
        value.put("fullName", resident.fullName());
        value.put("gender", resident.gender());
        value.put("birthDate", resident.birthDate());
        value.put("phone", resident.phone());
        return value;
    }

    private String valueOrDash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }
}
