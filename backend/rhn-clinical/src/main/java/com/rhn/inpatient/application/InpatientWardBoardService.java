package com.rhn.inpatient.application;

import com.rhn.inpatient.api.InpatientViews.EpisodeView;
import com.rhn.inpatient.api.InpatientViews.WardBoardView;
import com.rhn.inpatient.api.InpatientViews.WardMetricsView;
import com.rhn.inpatient.api.InpatientViews.WardPatientView;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientOrderTask;
import com.rhn.inpatient.domain.InpatientOrderWorkflow;
import com.rhn.inpatient.infrastructure.InpatientCareRequestRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderTaskRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderWorkflowRepository;
import com.rhn.pharmacy.api.WardDeliveryDirectory;
import com.rhn.pharmacy.api.WardDeliveryDirectory.WardDeliveryProgress;
import com.rhn.pharmacy.api.WardDeliveryDirectory.WardDeliverySummary;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class InpatientWardBoardService {
    private final InpatientApplicationService inpatient;
    private final InpatientOrderWorkflowRepository workflows;
    private final InpatientOrderTaskRepository tasks;
    private final InpatientCareRequestRepository requests;
    private final WardDeliveryDirectory deliveries;
    private final ExecutionContextProvider contextProvider;

    public InpatientWardBoardService(
            InpatientApplicationService inpatient,
            InpatientOrderWorkflowRepository workflows,
            InpatientOrderTaskRepository tasks,
            InpatientCareRequestRepository requests,
            WardDeliveryDirectory deliveries,
            ExecutionContextProvider contextProvider) {
        this.inpatient = inpatient;
        this.workflows = workflows;
        this.tasks = tasks;
        this.requests = requests;
        this.deliveries = deliveries;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public WardBoardView wardBoard(Instant from, Instant to) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.organizationId() == null || context.departmentId() == null) {
            throw badRequest("INPATIENT_WARD_CONTEXT_REQUIRED", "请先选择病区工作上下文");
        }
        validateShift(from, to);
        Instant now = Instant.now();
        List<EpisodeView> episodes = inpatient.bootstrap("ACTIVE", null).episodes().stream()
                .filter(value -> context.departmentId().equals(value.departmentId()))
                .toList();
        if (episodes.isEmpty()) {
            return new WardBoardView(now, from, to,
                    new WardMetricsView(0, 0, 0, 0, 0, 0, 0, 0), List.of());
        }

        List<Long> episodeIds = episodes.stream().map(EpisodeView::id).toList();
        List<InpatientOrderWorkflow> episodeWorkflows = workflows
                .findByTenantIdAndEpisodeIdInOrderByUpdatedAtDesc(context.tenantId(), episodeIds);
        Map<Long, Long> episodeByRequest = new HashMap<>();
        episodeWorkflows.forEach(value -> episodeByRequest.put(value.requestId(), value.episodeId()));
        List<Long> requestIds = List.copyOf(episodeByRequest.keySet());
        List<InpatientOrderTask> plannedTasks = requestIds.isEmpty() ? List.of()
                : tasks.findByTenantIdAndRequestIdInAndStatusOrderByScheduledAtAsc(
                        context.tenantId(), requestIds, "PLANNED").stream()
                        // Preserve overdue work, but do not allow later shifts to flood this handover.
                        .filter(value -> value.scheduledAt().isBefore(to))
                        .filter(value -> !value.scheduledAt().isBefore(from)
                                || value.scheduledAt().isBefore(now))
                        .toList();
        Map<Long, InpatientCareRequest> requestById = new HashMap<>();
        requests.findAllById(requestIds).stream()
                .filter(value -> context.tenantId().equals(value.tenantId()))
                .forEach(value -> requestById.put(value.id(), value));
        Map<Long, List<InpatientOrderTask>> tasksByEpisode = new HashMap<>();
        plannedTasks.forEach(task -> {
            Long episodeId = episodeByRequest.get(task.requestId());
            if (episodeId != null) tasksByEpisode.computeIfAbsent(episodeId, ignored -> new ArrayList<>()).add(task);
        });
        Map<Long, Integer> verificationByEpisode = new HashMap<>();
        episodeWorkflows.stream().filter(value -> "SIGNED".equals(value.workflowStatus()))
                .forEach(value -> verificationByEpisode.merge(value.episodeId(), 1, Integer::sum));
        WardDeliverySummary deliverySummary = deliveries.summarize(
                context.tenantId(), context.organizationId(), episodes.stream().map(EpisodeView::encounterId).toList());
        Map<Long, WardDeliveryProgress> deliveryByEncounter = deliverySummary.byEncounter();

        List<WardPatientView> patients = episodes.stream().map(episode -> patient(
                        episode, tasksByEpisode.getOrDefault(episode.id(), List.of()),
                        verificationByEpisode.getOrDefault(episode.id(), 0), requestById,
                        deliveryByEncounter.get(episode.encounterId()), now))
                .sorted(Comparator.comparingInt(InpatientWardBoardService::attentionOrder)
                        .thenComparing(InpatientWardBoardService::compareBedNo)
                        .thenComparing(WardPatientView::residentName))
                .toList();
        int verification = patients.stream().mapToInt(WardPatientView::pendingVerificationCount).sum();
        int pending = patients.stream().mapToInt(WardPatientView::pendingTaskCount).sum();
        int overdue = patients.stream().mapToInt(WardPatientView::overdueTaskCount).sum();
        int awaitingReceiptPatients = (int) patients.stream()
                .filter(value -> value.awaitingReceiptCount() > 0).count();
        int specialCare = (int) patients.stream().filter(value ->
                "SPECIAL".equals(value.nursingLevelCode()) || "LEVEL_I".equals(value.nursingLevelCode())).count();
        int exceptions = (int) patients.stream().filter(value ->
                "EXCEPTION".equals(value.attentionLevel()) || "OVERDUE".equals(value.attentionLevel())
                        || "AWAITING_RECEIPT".equals(value.attentionLevel())).count();
        return new WardBoardView(now, from, to, new WardMetricsView(
                patients.size(), specialCare, verification, pending, overdue, awaitingReceiptPatients,
                deliverySummary.total().inTransitCount(), exceptions), patients);
    }

    private WardPatientView patient(EpisodeView episode, List<InpatientOrderTask> patientTasks,
                                    int pendingVerification,
                                    Map<Long, InpatientCareRequest> requestById,
                                    WardDeliveryProgress delivery, Instant now) {
        int overdue = (int) patientTasks.stream().filter(value -> value.scheduledAt().isBefore(now)).count();
        Map<String, Integer> categoryCounts = new LinkedHashMap<>();
        patientTasks.forEach(task -> {
            InpatientCareRequest request = requestById.get(task.requestId());
            String category = request == null ? "NURSING" : request.orderCategory();
            categoryCounts.merge(category, 1, Integer::sum);
        });
        WardDeliveryProgress progress = delivery == null
                ? new WardDeliveryProgress(0, 0, 0) : delivery;
        String attentionLevel = progress.discrepancyCount() > 0 ? "EXCEPTION"
                : overdue > 0 ? "OVERDUE"
                : progress.inTransitCount() > 0 ? "AWAITING_RECEIPT"
                : isHighCare(episode.nursingLevelCode()) ? "HIGH_CARE"
                : pendingVerification > 0 || !patientTasks.isEmpty() || progress.pendingDispatchCount() > 0
                    ? "PENDING" : "STABLE";
        return new WardPatientView(
                episode.id(), episode.encounterId(), episode.residentId(), episode.residentName(),
                episode.episodeNo(), episode.bedNo(), episode.wardName(), episode.nursingLevelCode(),
                episode.admittedAt(), pendingVerification, patientTasks.size(), overdue,
                categoryCounts.getOrDefault("MEDICATION", 0),
                categoryCounts.getOrDefault("SERVICE", 0),
                categoryCounts.getOrDefault("NURSING", 0),
                progress.pendingDispatchCount(), progress.inTransitCount(), progress.discrepancyCount(),
                attentionLevel, summary(pendingVerification, patientTasks.size(), overdue, progress));
    }

    private static String summary(int pendingVerification, int pendingTasks, int overdue,
                                  WardDeliveryProgress delivery) {
        List<String> parts = new ArrayList<>();
        if (pendingVerification > 0) parts.add("待核对医嘱 " + pendingVerification + " 条");
        if (pendingTasks > 0) parts.add("本班待执行 " + pendingTasks + " 项" + (overdue > 0 ? "（逾期 " + overdue + " 项）" : ""));
        if (delivery.pendingDispatchCount() > 0) parts.add(delivery.pendingDispatchCount() + " 批药品待送出");
        if (delivery.inTransitCount() > 0) parts.add(delivery.inTransitCount() + " 批药品待签收");
        if (delivery.discrepancyCount() > 0) parts.add(delivery.discrepancyCount() + " 批交接存在差异");
        return parts.isEmpty() ? "当前无待办，可常规交接" : String.join("；", parts);
    }

    private static int attentionOrder(WardPatientView value) {
        return switch (value.attentionLevel()) {
            case "EXCEPTION" -> 0;
            case "OVERDUE" -> 1;
            case "AWAITING_RECEIPT" -> 2;
            case "HIGH_CARE" -> 3;
            case "PENDING" -> 4;
            default -> 5;
        };
    }

    private static int compareBedNo(WardPatientView left, WardPatientView right) {
        return compareNatural(left.bedNo(), right.bedNo());
    }

    static int compareNatural(String left, String right) {
        if (left == null) return right == null ? 0 : 1;
        if (right == null) return -1;
        int leftIndex = 0;
        int rightIndex = 0;
        while (leftIndex < left.length() && rightIndex < right.length()) {
            char leftChar = left.charAt(leftIndex);
            char rightChar = right.charAt(rightIndex);
            if (Character.isDigit(leftChar) && Character.isDigit(rightChar)) {
                int leftEnd = digitRunEnd(left, leftIndex);
                int rightEnd = digitRunEnd(right, rightIndex);
                int leftSignificant = significantDigitStart(left, leftIndex, leftEnd);
                int rightSignificant = significantDigitStart(right, rightIndex, rightEnd);
                int lengthComparison = Integer.compare(leftEnd - leftSignificant, rightEnd - rightSignificant);
                if (lengthComparison != 0) return lengthComparison;
                int numberComparison = left.substring(leftSignificant, leftEnd)
                        .compareTo(right.substring(rightSignificant, rightEnd));
                if (numberComparison != 0) return numberComparison;
                int zeroComparison = Integer.compare(leftEnd - leftIndex, rightEnd - rightIndex);
                if (zeroComparison != 0) return zeroComparison;
                leftIndex = leftEnd;
                rightIndex = rightEnd;
                continue;
            }
            int characterComparison = Character.compare(
                    Character.toLowerCase(leftChar), Character.toLowerCase(rightChar));
            if (characterComparison != 0) return characterComparison;
            leftIndex++;
            rightIndex++;
        }
        return Integer.compare(left.length() - leftIndex, right.length() - rightIndex);
    }

    private static int digitRunEnd(String value, int start) {
        int end = start;
        while (end < value.length() && Character.isDigit(value.charAt(end))) end++;
        return end;
    }

    private static int significantDigitStart(String value, int start, int end) {
        int significant = start;
        while (significant < end - 1 && value.charAt(significant) == '0') significant++;
        return significant;
    }

    private static void validateShift(Instant from, Instant to) {
        if (from == null || to == null || !from.isBefore(to)) {
            throw badRequest("INPATIENT_WARD_SHIFT_RANGE_INVALID", "班次开始时间必须早于结束时间");
        }
        if (Duration.between(from, to).compareTo(Duration.ofHours(24)) > 0) {
            throw badRequest("INPATIENT_WARD_SHIFT_TOO_LONG", "单次病区交接班范围不能超过 24 小时");
        }
    }

    private static boolean isHighCare(String value) {
        return "SPECIAL".equals(value) || "LEVEL_I".equals(value);
    }
}
