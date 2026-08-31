package com.rhn.coordination.application;

import com.rhn.billing.api.BillingFlowDirectory;
import com.rhn.billing.api.BillingFlowDirectory.BillingFlowSnapshot;
import com.rhn.coordination.api.OutpatientFlowViews.BoardView;
import com.rhn.coordination.api.OutpatientFlowViews.StageView;
import com.rhn.coordination.api.OutpatientFlowViews.SummaryView;
import com.rhn.coordination.api.OutpatientFlowViews.VisitView;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminateEncounterRequest;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminationIssueView;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminationReadinessView;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminationResultView;
import com.rhn.diagnostics.api.DiagnosticFlowDirectory;
import com.rhn.diagnostics.api.DiagnosticFlowDirectory.DiagnosticFlowSnapshot;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.EncounterFlowDirectory;
import com.rhn.outpatient.api.EncounterFlowDirectory.EncounterFlowSnapshot;
import com.rhn.outpatient.api.OutpatientEncounterTerminationDirectory;
import com.rhn.outpatient.api.OutpatientReferralFlowDirectory;
import com.rhn.outpatient.api.OutpatientReferralFlowDirectory.ReferralFlowSnapshot;
import com.rhn.pharmacy.api.PharmacyFlowDirectory;
import com.rhn.pharmacy.api.PharmacyFlowDirectory.PharmacyFlowSnapshot;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.treatment.api.TreatmentFlowDirectory;
import com.rhn.treatment.api.TreatmentFlowDirectory.TreatmentFlowSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class OutpatientFlowService {
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final EncounterFlowDirectory encounters;
    private final ResidentDirectory residents;
    private final BillingFlowDirectory billing;
    private final PharmacyFlowDirectory pharmacy;
    private final DiagnosticFlowDirectory diagnostics;
    private final TreatmentFlowDirectory treatments;
    private final OutpatientEncounterTerminationDirectory termination;
    private final OutpatientReferralFlowDirectory referrals;
    private final ExecutionContextProvider contextProvider;

    public OutpatientFlowService(EncounterFlowDirectory encounters, ResidentDirectory residents,
                                 BillingFlowDirectory billing, PharmacyFlowDirectory pharmacy,
                                 DiagnosticFlowDirectory diagnostics, TreatmentFlowDirectory treatments,
                                 OutpatientEncounterTerminationDirectory termination,
                                 OutpatientReferralFlowDirectory referrals,
                                 ExecutionContextProvider contextProvider) {
        this.encounters = encounters;
        this.residents = residents;
        this.billing = billing;
        this.pharmacy = pharmacy;
        this.diagnostics = diagnostics;
        this.treatments = treatments;
        this.termination = termination;
        this.referrals = referrals;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public TerminationReadinessView terminationReadiness(Long encounterId) {
        ExecutionContext context = requireWorkContext();
        var candidate = termination.requireCandidate(encounterId);
        List<Long> encounterIds = List.of(encounterId);
        BillingFlowSnapshot bill = billing.summarize(context.tenantId(), encounterIds).get(encounterId);
        PharmacyFlowSnapshot drug = pharmacy.summarize(context.tenantId(), context.organizationId(), encounterIds)
                .get(encounterId);
        DiagnosticFlowSnapshot diagnostic = diagnostics.summarize(context.tenantId(), encounterIds).get(encounterId);
        TreatmentFlowSnapshot treatment = treatments.summarize(context.tenantId(), encounterIds).get(encounterId);
        List<TerminationIssueView> issues = terminationIssues(encounterId, candidate.status(), bill, drug,
                diagnostic, treatment);
        return new TerminationReadinessView(encounterId, candidate.status(), issues.isEmpty(), issues, Instant.now());
    }

    @Transactional
    public TerminationResultView terminate(Long encounterId, TerminateEncounterRequest request) {
        var candidate = termination.requireCandidate(encounterId);
        if ("TERMINATED".equals(candidate.status())) return terminationResult(candidate);
        TerminationReadinessView readiness = terminationReadiness(encounterId);
        if (!readiness.ready()) {
            throw conflict("ENCOUNTER_TERMINATION_BLOCKED", readiness.issues().stream()
                    .map(TerminationIssueView::message).collect(java.util.stream.Collectors.joining("；")));
        }
        return terminationResult(termination.terminate(new OutpatientEncounterTerminationDirectory.TerminationCommand(
                encounterId, request.commandCode(), request.terminationCode(), request.reason())));
    }

    private List<TerminationIssueView> terminationIssues(Long encounterId, String clinicalStatus,
                                                          BillingFlowSnapshot bill, PharmacyFlowSnapshot drug,
                                                          DiagnosticFlowSnapshot diagnostic,
                                                          TreatmentFlowSnapshot treatment) {
        List<TerminationIssueView> issues = new ArrayList<>();
        if (!List.of("IN_PROGRESS", "SUSPENDED").contains(clinicalStatus)) {
            issues.add(new TerminationIssueView("CLINICAL_STATE_INVALID", "只有接诊中或已暂挂的就诊可以终止",
                    "/outpatient/reception?encounterId=" + encounterId));
        }
        if (bill != null && bill.outstandingAmount().signum() > 0) {
            issues.add(new TerminationIssueView("OUTSTANDING_AMOUNT",
                    "尚有待收费用 ¥" + bill.outstandingAmount() + "，请先结算或撤销相关医嘱",
                    "/billing?encounterId=" + encounterId));
        }
        if (bill != null && bill.refundableAmount().signum() > 0) {
            issues.add(new TerminationIssueView("REFUNDABLE_AMOUNT",
                    "尚有待退费用 ¥" + bill.refundableAmount() + "，请先完成退费",
                    "/billing?encounterId=" + encounterId));
        }
        if (drug != null && drug.waitingCount() + drug.inProgressCount() + drug.exceptionCount() > 0) {
            issues.add(new TerminationIssueView("PHARMACY_PENDING", "药房仍有待取、处理中或异常任务",
                    "/pharmacy?encounterId=" + encounterId));
        }
        if (diagnostic != null && diagnostic.blockedCount() + diagnostic.waitingCount()
                + diagnostic.inProgressCount() + diagnostic.exceptionCount() > 0) {
            issues.add(new TerminationIssueView("DIAGNOSTIC_PENDING", "检查检验仍有待结算、待执行或异常任务",
                    "/diagnostics?encounterId=" + encounterId));
        }
        if (treatment != null && treatment.settlementBlockedCount() + treatment.dispenseBlockedCount()
                + treatment.waitingCount() + treatment.inProgressCount() + treatment.exceptionCount() > 0) {
            issues.add(new TerminationIssueView("TREATMENT_PENDING", "治疗仍有待结算、待备药、待执行或异常任务",
                    "/treatments?encounterId=" + encounterId));
        }
        return List.copyOf(issues);
    }

    private TerminationResultView terminationResult(
            OutpatientEncounterTerminationDirectory.TerminationSnapshot value) {
        return new TerminationResultView(value.encounterId(), value.status(), value.terminationCode(),
                value.terminationReason(), value.terminatedAt(), "本次接诊已终止，既有诊疗事实已保留");
    }

    @Transactional(readOnly = true)
    public BoardView board(LocalDate businessDate, String flowStatus, String keyword) {
        ExecutionContext context = requireWorkContext();
        LocalDate date = businessDate == null ? LocalDate.now(ZoneId.systemDefault()) : businessDate;
        Instant from = date.atStartOfDay(ZoneId.systemDefault()).toInstant();
        Instant to = date.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant();
        List<EncounterFlowSnapshot> encounterValues = encounters.findRecent(context.tenantId(),
                context.organizationId(), context.departmentId(), from, to, 200);
        List<Long> encounterIds = encounterValues.stream().map(EncounterFlowSnapshot::encounterId).toList();
        Map<Long, BillingFlowSnapshot> billingFacts = billing.summarize(context.tenantId(), encounterIds);
        Map<Long, PharmacyFlowSnapshot> pharmacyFacts = pharmacy.summarize(
                context.tenantId(), context.organizationId(), encounterIds);
        Map<Long, DiagnosticFlowSnapshot> diagnosticFacts = diagnostics.summarize(context.tenantId(), encounterIds);
        Map<Long, TreatmentFlowSnapshot> treatmentFacts = treatments.summarize(context.tenantId(), encounterIds);
        Map<Long, ReferralFlowSnapshot> referralFacts = referrals.summarize(context.tenantId(), encounterIds);
        Map<Long, ResidentDirectory.ResidentSnapshot> residentFacts = new LinkedHashMap<>();

        String statusFilter = upper(flowStatus);
        String term = upper(keyword);
        Instant refreshedAt = Instant.now();
        List<VisitView> visits = encounterValues.stream().map(encounter -> {
            ResidentDirectory.ResidentSnapshot resident = residentFacts.computeIfAbsent(
                    encounter.residentId(), residents::requireSnapshot);
            return visit(encounter, resident, billingFacts.get(encounter.encounterId()),
                    pharmacyFacts.get(encounter.encounterId()), diagnosticFacts.get(encounter.encounterId()),
                    treatmentFacts.get(encounter.encounterId()), referralFacts.get(encounter.encounterId()), refreshedAt);
        }).filter(value -> statusFilter == null || statusFilter.equals(value.flowStatus()))
                .filter(value -> term == null || searchable(value).contains(term))
                .sorted(this::compareForClosure)
                .toList();
        return new BoardView(date, refreshedAt, summary(visits), visits);
    }

    private VisitView visit(EncounterFlowSnapshot encounter, ResidentDirectory.ResidentSnapshot resident,
                            BillingFlowSnapshot bill, PharmacyFlowSnapshot pharmacy,
                            DiagnosticFlowSnapshot diagnostic, TreatmentFlowSnapshot treatment,
                            ReferralFlowSnapshot referral,
                            Instant refreshedAt) {
        List<StageView> stages = new ArrayList<>();
        stages.add(clinicalStage(encounter));
        if (bill != null && bill.accountCount() > 0) stages.add(billingStage(encounter.encounterId(), bill));
        if (pharmacy != null && pharmacy.totalCount() > 0) stages.add(pharmacyStage(encounter.encounterId(), pharmacy));
        if (diagnostic != null && diagnostic.totalCount() > 0) stages.add(diagnosticStage(encounter.encounterId(), diagnostic));
        if (treatment != null && treatment.totalCount() > 0) stages.add(treatmentStage(encounter.encounterId(), treatment));
        if (referral != null && referral.totalCount() > 0) stages.add(referralStage(encounter.encounterId(), referral));

        Destination destination = destination(encounter, bill, pharmacy, diagnostic, treatment, referral);
        Instant pendingSince = pendingSince(encounter, destination.status());
        long pendingMinutes = pendingSince == null ? 0
                : Math.max(0, Duration.between(pendingSince, refreshedAt).toMinutes());
        return new VisitView(encounter.encounterId(), encounter.encounterNo(), encounter.residentId(),
                resident.fullName(), resident.healthRecordNo(), resident.gender(), encounter.clinicalStatus(),
                destination.status(), destination.statusText(), destination.name(),
                route(destination.route(), encounter, resident),
                destination.actionText(), destination.reason(), pendingSince, pendingMinutes,
                bill == null ? ZERO : bill.outstandingAmount(), encounter.registeredAt(), encounter.startedAt(),
                encounter.completedAt(), List.copyOf(stages));
    }

    private Destination destination(EncounterFlowSnapshot encounter, BillingFlowSnapshot bill,
                                    PharmacyFlowSnapshot pharmacy, DiagnosticFlowSnapshot diagnostic,
                                    TreatmentFlowSnapshot treatment, ReferralFlowSnapshot referral) {
        if ("CANCELLED".equals(encounter.clinicalStatus())) {
            return destination("CANCELLED", "已取消", "无需后续处理", null,
                    "挂号已撤销", null);
        }
        if ("TERMINATED".equals(encounter.clinicalStatus())) {
            String reason = encounter.terminationReason() == null ? "接诊已终止"
                    : "诊疗已终止：" + encounter.terminationReason();
            return destination("TERMINATED", "已终止", "无需后续处理", null, reason, null);
        }
        if ("TRANSFERRED".equals(encounter.clinicalStatus())) {
            String target = referral == null || referral.targetDepartmentName() == null
                    ? "目标科室" : referral.targetDepartmentName();
            return destination("TRANSFERRED", "已转科", "已转至" + target, null,
                    "原科室接诊已完成，目标科室已生成连续就诊", null);
        }
        if ("REGISTERED".equals(encounter.clinicalStatus())) {
            return destination("WAITING_CONSULTATION", "候诊中", "门诊医生站", "/outpatient/reception",
                    "等待医生接诊", "开始接诊");
        }
        if ("IN_PROGRESS".equals(encounter.clinicalStatus())) {
            if (referral != null && referral.pendingCount() > 0
                    && "INTERNAL_CONSULT".equals(referral.activeType())) {
                String state = "ACCEPTED".equals(referral.activeStatus()) ? "会诊科室已接收，等待填写意见" : "等待会诊科室接收";
                return destination("WAITING_COORDINATION", "会诊中", referral.targetDepartmentName(),
                        "/outpatient/reception", state, "查看协同业务");
            }
            return destination("IN_CONSULTATION", "接诊中", "门诊医生站", "/outpatient/reception",
                    "已接诊，尚未完成病历与诊毕", "继续接诊");
        }
        if ("SUSPENDED".equals(encounter.clinicalStatus())) {
            if (referral != null && referral.pendingCount() > 0
                    && "DEPARTMENT_TRANSFER".equals(referral.activeType())) {
                return destination("WAITING_TRANSFER", "待转科接收", referral.targetDepartmentName(), null,
                        "原科室已完成交接准备，等待目标科室接收", null);
            }
            return destination("CONSULTATION_SUSPENDED", "已暂挂", "门诊医生站", "/outpatient/reception",
                    "接诊已暂挂，需恢复后继续", "恢复接诊");
        }
        if (bill != null && bill.refundableAmount().signum() > 0) {
            return destination("EXCEPTION", "需人工处理", "费用结算", "/billing",
                    "存在待退费用 ¥" + bill.refundableAmount(), "处理退费");
        }
        if (pharmacy != null && pharmacy.exceptionCount() > 0) {
            return destination("EXCEPTION", "需人工处理", "门诊药房", "/pharmacy",
                    "药房存在 " + pharmacy.exceptionCount() + " 项异常任务", "处理药房异常");
        }
        if (diagnostic != null && diagnostic.exceptionCount() > 0) {
            return destination("EXCEPTION", "需人工处理", "检查检验", "/diagnostics",
                    "医技存在 " + diagnostic.exceptionCount() + " 项异常任务", "处理医技异常");
        }
        if (treatment != null && treatment.exceptionCount() > 0) {
            return destination("EXCEPTION", "需人工处理", "治疗执行", "/treatments",
                    "治疗存在 " + treatment.exceptionCount() + " 项异常任务", "处理治疗异常");
        }
        if (bill != null && bill.outstandingAmount().signum() > 0) {
            return destination("WAITING_SETTLEMENT", "待结算", "费用结算", "/billing",
                    "存在待收费用 ¥" + bill.outstandingAmount(), "去结算");
        }
        if (diagnostic != null && diagnostic.blockedCount() > 0) {
            return destination("WAITING_SETTLEMENT", "待结算", "费用结算", "/billing",
                    diagnostic.blockedCount() + " 项检查检验尚未结算", "去结算");
        }
        if (treatment != null && treatment.settlementBlockedCount() > 0) {
            return destination("WAITING_SETTLEMENT", "待结算", "费用结算", "/billing",
                    treatment.settlementBlockedCount() + " 项治疗尚未结算", "去结算");
        }
        if (pharmacy != null && pharmacy.inProgressCount() > 0) {
            return destination("DOWNSTREAM_IN_PROGRESS", "药房处理中", "门诊药房", "/pharmacy",
                    pharmacy.inProgressCount() + " 项药品正在处理", "查看药房进度");
        }
        if (diagnostic != null && diagnostic.inProgressCount() > 0) {
            return destination("DOWNSTREAM_IN_PROGRESS", "医技执行中", "检查检验", "/diagnostics",
                    diagnostic.inProgressCount() + " 项检查检验正在执行", "查看医技进度");
        }
        if (treatment != null && treatment.inProgressCount() > 0) {
            return destination("DOWNSTREAM_IN_PROGRESS", "治疗执行中", "治疗执行", "/treatments",
                    treatment.inProgressCount() + " 项治疗正在执行", "查看治疗进度");
        }
        if (pharmacy != null && pharmacy.waitingCount() > 0
                || treatment != null && treatment.dispenseBlockedCount() > 0) {
            int count = (pharmacy == null ? 0 : pharmacy.waitingCount())
                    + (treatment == null ? 0 : treatment.dispenseBlockedCount());
            return destination("WAITING_PHARMACY", "待取药", "门诊药房", "/pharmacy",
                    count + " 项药品等待发放", "去取药");
        }
        if (diagnostic != null && diagnostic.waitingCount() > 0) {
            return destination("WAITING_DIAGNOSTICS", "待检查检验", "检查检验", "/diagnostics",
                    diagnostic.waitingCount() + " 项检查检验待执行", "去检查检验");
        }
        if (treatment != null && treatment.waitingCount() > 0) {
            return destination("WAITING_TREATMENT", "待治疗", "治疗执行", "/treatments",
                    treatment.waitingCount() + " 项治疗待执行", "去治疗");
        }
        return destination("COMPLETED", "流程完成", "可以离院", null,
                "接诊及诊后环节均已完成", null);
    }

    private Destination destination(String status, String statusText, String name, String route,
                                    String reason, String actionText) {
        return new Destination(status, statusText, name, route, reason, actionText);
    }

    private Instant pendingSince(EncounterFlowSnapshot encounter, String flowStatus) {
        if ("COMPLETED".equals(flowStatus) || "CANCELLED".equals(flowStatus)
                || "TERMINATED".equals(flowStatus) || "TRANSFERRED".equals(flowStatus)) return null;
        if ("WAITING_CONSULTATION".equals(flowStatus)) return encounter.registeredAt();
        if ("IN_CONSULTATION".equals(flowStatus) || "CONSULTATION_SUSPENDED".equals(flowStatus)) {
            return encounter.startedAt() == null ? encounter.registeredAt() : encounter.startedAt();
        }
        if (encounter.completedAt() != null) return encounter.completedAt();
        return encounter.startedAt() == null ? encounter.registeredAt() : encounter.startedAt();
    }

    private StageView clinicalStage(EncounterFlowSnapshot value) {
        return switch (value.clinicalStatus()) {
            case "REGISTERED" -> stage("CLINICAL", "接诊", "WAITING", "候诊", 1, 1, "/outpatient/reception");
            case "IN_PROGRESS" -> stage("CLINICAL", "接诊", "IN_PROGRESS", "诊疗中", 1, 1, "/outpatient/reception");
            case "SUSPENDED" -> stage("CLINICAL", "接诊", "BLOCKED", "已暂挂", 1, 1, "/outpatient/reception");
            case "COMPLETED" -> stage("CLINICAL", "接诊", "COMPLETED", "诊毕", 1, 0, "/outpatient/reception");
            case "TRANSFERRED" -> stage("CLINICAL", "接诊", "COMPLETED", "已转科", 1, 0, "/outpatient/reception");
            case "TERMINATED" -> stage("CLINICAL", "接诊", "CANCELLED", "已终止", 1, 0, "/outpatient/reception");
            default -> stage("CLINICAL", "接诊", "CANCELLED", "已取消", 1, 0, "/outpatient/reception");
        };
    }

    private StageView billingStage(Long encounterId, BillingFlowSnapshot value) {
        if (value.refundableAmount().signum() > 0) return stage("BILLING", "费用", "EXCEPTION",
                "待退费 " + value.refundableAmount(), value.accountCount(), 1, "/billing?encounterId=" + encounterId);
        if (value.outstandingAmount().signum() > 0) return stage("BILLING", "费用", "WAITING",
                "待收 " + value.outstandingAmount(), value.accountCount(), 1, "/billing?encounterId=" + encounterId);
        return stage("BILLING", "费用", "COMPLETED", "已结算", value.accountCount(), 0,
                "/billing?encounterId=" + encounterId);
    }

    private StageView pharmacyStage(Long encounterId, PharmacyFlowSnapshot value) {
        if (value.exceptionCount() > 0) return stage("PHARMACY", "取药", "EXCEPTION", "需处理",
                value.totalCount(), value.exceptionCount(), "/pharmacy?encounterId=" + encounterId);
        if (value.inProgressCount() > 0) return stage("PHARMACY", "取药", "IN_PROGRESS", "处理中",
                value.totalCount(), value.inProgressCount() + value.waitingCount(), "/pharmacy?encounterId=" + encounterId);
        if (value.waitingCount() > 0) return stage("PHARMACY", "取药", "WAITING", "待取药",
                value.totalCount(), value.waitingCount(), "/pharmacy?encounterId=" + encounterId);
        return stage("PHARMACY", "取药", "COMPLETED", "已完成", value.totalCount(), 0,
                "/pharmacy?encounterId=" + encounterId);
    }

    private StageView diagnosticStage(Long encounterId, DiagnosticFlowSnapshot value) {
        if (value.exceptionCount() > 0) return stage("DIAGNOSTICS", "医技", "EXCEPTION", "需处理",
                value.totalCount(), value.exceptionCount(), "/diagnostics?encounterId=" + encounterId);
        if (value.inProgressCount() > 0) return stage("DIAGNOSTICS", "医技", "IN_PROGRESS", "执行中",
                value.totalCount(), value.inProgressCount() + value.waitingCount(), "/diagnostics?encounterId=" + encounterId);
        if (value.blockedCount() > 0) return stage("DIAGNOSTICS", "医技", "BLOCKED", "待结算",
                value.totalCount(), value.blockedCount() + value.waitingCount(), "/diagnostics?encounterId=" + encounterId);
        if (value.waitingCount() > 0) return stage("DIAGNOSTICS", "医技", "WAITING", "待执行",
                value.totalCount(), value.waitingCount(), "/diagnostics?encounterId=" + encounterId);
        return stage("DIAGNOSTICS", "医技", "COMPLETED", "已完成", value.totalCount(), 0,
                "/diagnostics?encounterId=" + encounterId);
    }

    private StageView treatmentStage(Long encounterId, TreatmentFlowSnapshot value) {
        if (value.exceptionCount() > 0) return stage("TREATMENT", "治疗", "EXCEPTION", "需处理",
                value.totalCount(), value.exceptionCount(), "/treatments?encounterId=" + encounterId);
        if (value.inProgressCount() > 0) return stage("TREATMENT", "治疗", "IN_PROGRESS", "执行中",
                value.totalCount(), value.inProgressCount() + value.waitingCount(), "/treatments?encounterId=" + encounterId);
        if (value.settlementBlockedCount() > 0) return stage("TREATMENT", "治疗", "BLOCKED", "待结算",
                value.totalCount(), value.settlementBlockedCount(), "/treatments?encounterId=" + encounterId);
        if (value.dispenseBlockedCount() > 0) return stage("TREATMENT", "治疗", "BLOCKED", "待发药",
                value.totalCount(), value.dispenseBlockedCount(), "/treatments?encounterId=" + encounterId);
        if (value.waitingCount() > 0) return stage("TREATMENT", "治疗", "WAITING", "待执行",
                value.totalCount(), value.waitingCount(), "/treatments?encounterId=" + encounterId);
        return stage("TREATMENT", "治疗", "COMPLETED", "已完成", value.totalCount(), 0,
                "/treatments?encounterId=" + encounterId);
    }

    private StageView referralStage(Long encounterId, ReferralFlowSnapshot value) {
        if (value.pendingCount() > 0) {
            boolean accepted = "ACCEPTED".equals(value.activeStatus());
            String text = "DEPARTMENT_TRANSFER".equals(value.activeType())
                    ? "待转科接收" : accepted ? "会诊处理中" : "待会诊接收";
            return stage("COORDINATION", "协同", accepted ? "IN_PROGRESS" : "WAITING", text,
                    value.totalCount(), value.pendingCount(), "/outpatient/reception?encounterId=" + encounterId);
        }
        if (value.completedCount() > 0) {
            return stage("COORDINATION", "协同", "COMPLETED", "已完成", value.totalCount(), 0,
                    "/outpatient/reception?encounterId=" + encounterId);
        }
        return stage("COORDINATION", "协同", "CANCELLED", "已关闭", value.totalCount(), 0,
                "/outpatient/reception?encounterId=" + encounterId);
    }

    private StageView stage(String code, String name, String status, String text,
                            int total, int pending, String route) {
        return new StageView(code, name, status, text, total, pending, route);
    }

    private String route(String base, EncounterFlowSnapshot encounter,
                         ResidentDirectory.ResidentSnapshot resident) {
        if (base == null) return null;
        if (base.contains("?")) return base;
        return base + "?residentId=" + resident.id() + "&encounterId=" + encounter.encounterId();
    }

    private SummaryView summary(List<VisitView> values) {
        int waiting = 0, consulting = 0, downstream = 0, exceptions = 0, completed = 0;
        for (VisitView value : values) {
            switch (value.flowStatus()) {
                case "WAITING_CONSULTATION" -> waiting++;
                case "IN_CONSULTATION" -> consulting++;
                case "CONSULTATION_SUSPENDED" -> waiting++;
                case "WAITING_COORDINATION", "WAITING_TRANSFER" -> waiting++;
                case "EXCEPTION" -> exceptions++;
                case "COMPLETED", "TRANSFERRED", "TERMINATED", "CANCELLED" -> completed++;
                default -> downstream++;
            }
        }
        return new SummaryView(values.size(), waiting, consulting, downstream, exceptions, completed);
    }

    private String searchable(VisitView value) {
        return (value.residentName() + " " + value.healthRecordNo() + " " + value.encounterNo())
                .toUpperCase(Locale.ROOT);
    }

    private int compareForClosure(VisitView left, VisitView right) {
        boolean leftFinished = finished(left.flowStatus());
        boolean rightFinished = finished(right.flowStatus());
        if (leftFinished != rightFinished) return leftFinished ? 1 : -1;
        if (!leftFinished) {
            int pending = Long.compare(right.pendingMinutes(), left.pendingMinutes());
            if (pending != 0) return pending;
        }
        return right.registeredAt().compareTo(left.registeredAt());
    }

    private boolean finished(String flowStatus) {
        return "COMPLETED".equals(flowStatus) || "TERMINATED".equals(flowStatus)
                || "TRANSFERRED".equals(flowStatus) || "CANCELLED".equals(flowStatus);
    }

    private String upper(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw conflict(
                "OUTPATIENT_FLOW_WORK_CONTEXT_REQUIRED", "请先选择门诊机构和科室");
        return context;
    }

    private record Destination(String status, String statusText, String name, String route,
                               String reason, String actionText) {}
}
