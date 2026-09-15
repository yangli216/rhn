package com.rhn.inpatient.application;

import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory.EncounterDocumentAnchor;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.inpatient.api.InpatientViews.DischargeIssueView;
import com.rhn.inpatient.api.InpatientViews.DischargeDiagnosisView;
import com.rhn.inpatient.api.InpatientViews.DischargeReadinessView;
import com.rhn.inpatient.api.InpatientViews.RequiredDocumentView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientOrderTask;
import com.rhn.inpatient.domain.InpatientOrderWorkflow;
import com.rhn.inpatient.infrastructure.InpatientCareRequestRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderTaskRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderWorkflowRepository;
import com.rhn.pharmacy.api.InpatientMedicationStopDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class InpatientDischargeReadinessService {
    private static final List<RequiredDocument> REQUIRED_DOCUMENTS = List.of(
            new RequiredDocument("INPATIENT_DISCHARGE_RECORD", "出院记录", "DISCHARGE_RECORD"));

    private final InpatientOrderWorkflowRepository workflows;
    private final InpatientOrderTaskRepository tasks;
    private final InpatientCareRequestRepository requests;
    private final ClinicalDocumentDirectory clinicalDocuments;
    private final EncounterDiagnosisDirectory encounterDiagnoses;
    private final InpatientMedicationStopDirectory medicationStops;
    private final WardDeliveryDirectory wardDeliveries;

    public InpatientDischargeReadinessService(
            InpatientOrderWorkflowRepository workflows,
            InpatientOrderTaskRepository tasks,
            InpatientCareRequestRepository requests,
            ClinicalDocumentDirectory clinicalDocuments,
            EncounterDiagnosisDirectory encounterDiagnoses,
            InpatientMedicationStopDirectory medicationStops,
            WardDeliveryDirectory wardDeliveries) {
        this.workflows = workflows;
        this.tasks = tasks;
        this.requests = requests;
        this.clinicalDocuments = clinicalDocuments;
        this.encounterDiagnoses = encounterDiagnoses;
        this.medicationStops = medicationStops;
        this.wardDeliveries = wardDeliveries;
    }

    @Transactional(readOnly = true)
    public DischargeReadinessView assess(CareEpisode episode, InpatientEncounter encounter) {
        List<InpatientOrderWorkflow> episodeOrders = workflows
                .findByTenantIdAndEpisodeIdOrderByUpdatedAtDesc(episode.tenantId(), episode.id());
        List<InpatientOrderWorkflow> openLongTermOrders = episodeOrders.stream()
                .filter(value -> "LONG_TERM".equals(value.durationType()))
                .filter(value -> !closed(value.workflowStatus()))
                .toList();
        List<InpatientOrderWorkflow> incompleteTemporaryOrders = episodeOrders.stream()
                .filter(value -> "TEMPORARY".equals(value.durationType()))
                .filter(value -> !closed(value.workflowStatus()))
                .toList();
        List<InpatientOrderTask> pendingTasks = tasks.findPlannedByEpisode(
                episode.tenantId(), episode.id());

        List<DischargeIssueView> blockers = new ArrayList<>();
        addIssue(blockers, "INPATIENT_LONG_TERM_ORDER_NOT_STOPPED",
                openLongTermOrders.size() + " 条长期医嘱尚未停止",
                "INPATIENT_ORDER", requestIds(openLongTermOrders));
        addIssue(blockers, "INPATIENT_TEMPORARY_ORDER_INCOMPLETE",
                incompleteTemporaryOrders.size() + " 条临时医嘱尚未完成或停止",
                "INPATIENT_ORDER", requestIds(incompleteTemporaryOrders));
        addIssue(blockers, "INPATIENT_ORDER_TASK_PENDING",
                pendingTasks.size() + " 项医嘱执行任务尚未完成",
                "INPATIENT_ORDER_TASK", pendingTasks.stream().map(InpatientOrderTask::id).toList());

        Map<Long, InpatientCareRequest> requestById = new HashMap<>();
        requests.findAllById(episodeOrders.stream().map(InpatientOrderWorkflow::requestId).toList()).stream()
                .filter(value -> episode.tenantId().equals(value.tenantId()))
                .forEach(value -> requestById.put(value.id(), value));
        List<Long> pendingMedicationReturns = episodeOrders.stream()
                .filter(value -> "STOPPED".equals(value.workflowStatus()))
                .filter(value -> {
                    InpatientCareRequest request = requestById.get(value.requestId());
                    return request != null && "MEDICATION".equals(request.orderCategory());
                })
                .filter(value -> medicationStops.closure(episode.tenantId(), value.requestId()).returnRequired())
                .map(InpatientOrderWorkflow::requestId)
                .toList();
        addIssue(blockers, "INPATIENT_MEDICATION_RETURN_PENDING",
                pendingMedicationReturns.size() + " 条已停药品医嘱仍有病区余药待退回",
                "MEDICATION_REQUEST", pendingMedicationReturns);

        WardDeliveryDirectory.WardDeliveryProgress deliveryProgress = wardDeliveries
                .summarize(episode.tenantId(), episode.organizationId(), List.of(encounter.id()))
                .byEncounter().getOrDefault(encounter.id(), new WardDeliveryDirectory.WardDeliveryProgress(0, 0, 0));
        addCountIssue(blockers, "INPATIENT_MEDICATION_DELIVERY_PENDING_DISPATCH",
                deliveryProgress.pendingDispatchCount(), " 批住院药品尚未由药房送出", "WARD_DELIVERY");
        addCountIssue(blockers, "INPATIENT_MEDICATION_DELIVERY_IN_TRANSIT",
                deliveryProgress.inTransitCount(), " 批住院药品配送中，尚未完成病区签收", "WARD_DELIVERY");
        addCountIssue(blockers, "INPATIENT_MEDICATION_DELIVERY_DISCREPANCY",
                deliveryProgress.discrepancyCount(), " 批住院药品交接差异尚未处理", "WARD_DELIVERY");

        List<RequiredDocumentView> requiredDocuments = REQUIRED_DOCUMENTS.stream()
                .map(rule -> documentReadiness(encounter.id(), rule, blockers))
                .toList();
        List<DischargeDiagnosisView> dischargeDiagnoses = encounterDiagnoses
                .findActivePrimaryDiagnoses(episode.tenantId(), encounter.id(), "DISCHARGE").stream()
                .map(value -> new DischargeDiagnosisView(value.id(), value.diagnosisStage(), value.code(), value.display(),
                        value.diagnosisType(), value.verificationStatus(), value.diagnosisStatus()))
                .toList();
        if (dischargeDiagnoses.isEmpty()) {
            blockers.add(new DischargeIssueView(
                    "INPATIENT_DISCHARGE_DIAGNOSIS_MISSING", "缺少有效的主要出院诊断",
                    "ENCOUNTER_DIAGNOSIS", 1, List.of()));
        }
        return new DischargeReadinessView(
                episode.id(), encounter.id(), episode.status(), "DISCHARGED".equals(episode.status()),
                blockers.isEmpty(), Instant.now(), openLongTermOrders.size(), incompleteTemporaryOrders.size(),
                pendingTasks.size(), requiredDocuments, dischargeDiagnoses, blockers);
    }

    public void requireReady(DischargeReadinessView readiness) {
        if (readiness.ready()) return;
        String message = readiness.blockers().stream().map(DischargeIssueView::message)
                .reduce((left, right) -> left + "；" + right).orElse("存在未完成事项");
        throw conflict("INPATIENT_DISCHARGE_NOT_READY", "出院未就绪：" + message);
    }

    private RequiredDocumentView documentReadiness(
            Long encounterId, RequiredDocument rule, List<DischargeIssueView> blockers) {
        Optional<EncounterDocumentAnchor> found = clinicalDocuments
                .findEncounterDocumentAnchor(encounterId, rule.documentType());
        if (found.isEmpty()) {
            blockers.add(new DischargeIssueView(
                    "INPATIENT_" + rule.codeStem() + "_MISSING", "缺少已保存的" + rule.title(),
                    "CLINICAL_DOCUMENT", 1, List.of()));
            return new RequiredDocumentView(rule.documentType(), rule.title(), null, null, "MISSING", false);
        }
        EncounterDocumentAnchor anchor = found.orElseThrow();
        boolean signed = "SIGNED".equals(anchor.status());
        if (!signed) {
            blockers.add(new DischargeIssueView(
                    "INPATIENT_" + rule.codeStem() + "_UNSIGNED", rule.title() + "当前版本尚未签署",
                    "CLINICAL_DOCUMENT", 1, List.of(anchor.id())));
        }
        return new RequiredDocumentView(rule.documentType(), rule.title(), anchor.id(), anchor.version(),
                anchor.status(), signed);
    }

    private static void addIssue(List<DischargeIssueView> blockers, String code, String message,
                                 String objectType, List<Long> objectIds) {
        if (objectIds.isEmpty()) return;
        blockers.add(new DischargeIssueView(code, message, objectType, objectIds.size(), objectIds));
    }

    private static void addCountIssue(List<DischargeIssueView> blockers, String code, int count,
                                      String messageSuffix, String objectType) {
        if (count == 0) return;
        blockers.add(new DischargeIssueView(code, count + messageSuffix, objectType, count, List.of()));
    }

    private static List<Long> requestIds(List<InpatientOrderWorkflow> values) {
        return values.stream().map(InpatientOrderWorkflow::requestId).toList();
    }

    private static boolean closed(String status) {
        return "COMPLETED".equals(status) || "STOPPED".equals(status);
    }

    private record RequiredDocument(String documentType, String title, String codeStem) {
    }
}
