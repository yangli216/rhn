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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ServiceRequestPrintDataProvider implements PrintDataProvider {
    private final ServiceRequestRepository repository;
    private final EncounterDirectory encounters;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;

    ServiceRequestPrintDataProvider(ServiceRequestRepository repository, EncounterDirectory encounters,
                                    ResidentDirectory residents, OrganizationDirectory organizations) {
        this.repository = repository; this.encounters = encounters;
        this.residents = residents; this.organizations = organizations;
    }

    @Override public String providerCode() { return "SERVICE_REQUEST"; }

    String taskCode(Long encounterId, Long sourceId) {
        EncounterDirectory.EncounterSnapshot encounter = encounters.requireAccessible(encounterId);
        return taskCode(require(sourceId, encounter).serviceTypeSnapshot());
    }

    @Override
    public PrintDataSnapshot load(PrintDataRequest input) {
        if (input.source().encounterId() == null) {
            throw conflict("PRINT_ENCOUNTER_REQUIRED", "申请单打印必须提供就诊标识");
        }
        EncounterDirectory.EncounterSnapshot encounter = encounters.requireAccessible(input.source().encounterId());
        ServiceRequest request = require(input.source().sourceId(), encounter);
        String expectedTask = taskCode(request.serviceTypeSnapshot());
        if (!expectedTask.equals(input.taskCode())) {
            throw conflict("PRINT_TASK_SOURCE_MISMATCH", "申请单类型与标准打印任务不匹配");
        }
        if (!"ACTIVE".equals(request.status())) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "只有已生效且未撤销的诊疗申请可以生成正式打印文件");
        }
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(request.residentId());
        OrganizationView organization = organizations.requireOrganization(encounter.tenantId(), request.performerOrganizationId());
        DepartmentView department = organizations.requireDepartment(encounter.tenantId(),
                request.performerOrganizationId(), request.performerDepartmentId());
        String documentName = documentName(request.serviceTypeSnapshot());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", documentName); payload.put("organizationName", organization.name());
        payload.put("departmentName", department.name()); payload.put("encounterNo", encounter.encounterNo());
        payload.put("resident", residentMap(resident)); payload.put("requestNo", request.requestNo());
        payload.put("serviceType", request.serviceTypeSnapshot());
        payload.put("serviceTypeText", serviceTypeText(request.serviceTypeSnapshot()));
        payload.put("itemCode", request.itemCodeSnapshot()); payload.put("itemName", request.itemNameSnapshot());
        payload.put("localCode", request.localCodeSnapshot()); payload.put("localName", request.localNameSnapshot());
        String quantityText = request.quantity().stripTrailingZeros().toPlainString() + " " + request.unitCodeSnapshot();
        payload.put("quantityText", quantityText); payload.put("specimenType", valueOrDash(request.specimenTypeSnapshot()));
        payload.put("examinationType", valueOrDash(request.examinationTypeSnapshot()));
        payload.put("clinicalDescription", valueOrDash(request.clinicalDescription()));
        payload.put("reason", valueOrDash(request.reasonText())); payload.put("authoredAt", request.authoredAt());
        payload.put("authoredBy", request.authoredBy()); payload.put("businessDate", request.businessDate());
        payload.put("items", List.of(Map.of("itemCode", request.itemCodeSnapshot(),
                "itemName", request.itemNameSnapshot(), "quantityText", quantityText,
                "clinicalDescription", valueOrDash(request.clinicalDescription()))));
        return new PrintDataSnapshot("ServiceRequest", request.id(), request.revision(), request.residentId(),
                request.encounterId(), request.performerOrganizationId(), request.performerDepartmentId(),
                documentName + "-" + request.requestNo() + ".pdf", payload);
    }

    private ServiceRequest require(Long sourceId, EncounterDirectory.EncounterSnapshot encounter) {
        return repository.findByIdAndTenantId(sourceId, encounter.tenantId())
                .filter(value -> value.encounterId().equals(encounter.id()))
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到当前就诊的诊疗申请"));
    }

    private String taskCode(String serviceType) {
        return switch (serviceType == null ? "OTHER" : serviceType) {
            case "LABORATORY" -> PrintTaskCodes.LABORATORY_APPLICATION;
            case "EXAMINATION" -> PrintTaskCodes.EXAMINATION_APPLICATION;
            default -> PrintTaskCodes.TREATMENT_APPLICATION;
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
        Map<String, Object> value = new LinkedHashMap<>(); value.put("id", resident.id());
        value.put("healthRecordNo", resident.healthRecordNo()); value.put("fullName", resident.fullName());
        value.put("gender", resident.gender()); value.put("birthDate", resident.birthDate()); value.put("phone", resident.phone());
        return value;
    }

    private String valueOrDash(String value) { return value == null || value.isBlank() ? "-" : value; }
}
