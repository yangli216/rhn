package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
import com.rhn.outpatient.encounter.EncounterService;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 医生站精确定位：读卡、扫码等唯一识别患者后，判定其在本机构有效的就诊记录应如何处理。
 * 判定规则只在这里：前端按建议动作分发，不重复推断接诊归属。
 */
@Service
class ReceptionLocateService {
    static final String ENTER = "ENTER";
    static final String CONFIRM_TAKEOVER = "CONFIRM_TAKEOVER";
    static final String VIEW_ONLY = "VIEW_ONLY";

    private static final Set<String> WAITING = Set.of("WAITING", "CALLED");

    private final RegistrationApplicationService registrations;
    private final ReceptionQueueSettings queueSettings;
    private final ConfigurationDirectory configuration;
    private final ExecutionContextProvider contexts;

    ReceptionLocateService(RegistrationApplicationService registrations, ReceptionQueueSettings queueSettings,
                           ConfigurationDirectory configuration, ExecutionContextProvider contexts) {
        this.registrations = registrations;
        this.queueSettings = queueSettings;
        this.configuration = configuration;
        this.contexts = contexts;
    }

    /** ownership：MINE 我接诊、OTHER 他人接诊、UNASSIGNED 尚无接诊医生。outOfTurn：启用叫号且前面还有候诊患者。 */
    record Match(ReceptionQueueItem item, String ownership, String action, String reason,
                 Integer queuePosition, boolean outOfTurn) {}

    record View(Long residentId, boolean takeoverEnabled, boolean callingEnabled, List<Match> matches) {}

    @Transactional(readOnly = true)
    View locate(Long residentId) {
        ExecutionContext context = contexts.requireCurrent();
        boolean callingEnabled = queueSettings.current().callingEnabled();
        boolean takeoverEnabled = takeoverEnabled(context);
        List<ReceptionQueueItem> all = registrations.queue(null, null, ReceptionQueueScope.ORGANIZATION);
        List<Match> matches = all.stream()
                .filter(item -> residentId.equals(item.residentId()))
                .filter(item -> item.status() != null && !"CANCELLED".equals(item.registrationStatus()))
                .map(item -> match(item, all, context, callingEnabled, takeoverEnabled))
                .sorted(Comparator.comparingInt((Match value) -> "MINE".equals(value.ownership()) ? 0 : 1)
                        .thenComparingInt(value -> ENTER.equals(value.action()) ? 0 : 1))
                .toList();
        return new View(residentId, takeoverEnabled, callingEnabled, matches);
    }

    private Match match(ReceptionQueueItem item, List<ReceptionQueueItem> all, ExecutionContext context,
                        boolean callingEnabled, boolean takeoverEnabled) {
        boolean mine = item.clinicianId() != null && item.clinicianId().equalsIgnoreCase(context.actor());
        String ownership = item.clinicianId() == null ? "UNASSIGNED" : mine ? "MINE" : "OTHER";
        boolean sameDepartment = item.departmentId() == null || context.departmentId() == null
                || item.departmentId().equals(context.departmentId());
        String status = item.status();
        if ("COMPLETED".equals(status)) return new Match(item, ownership, VIEW_ONLY, "本次就诊已诊毕", null, false);
        if (!sameDepartment) return new Match(item, ownership, VIEW_ONLY, "挂号属于其他科室，只能查看", null, false);
        if (WAITING.contains(status) || "MISSED".equals(status)) {
            Integer position = WAITING.contains(status) ? position(item, all) : null;
            boolean outOfTurn = callingEnabled && position != null && position > 1 && "WAITING".equals(status);
            return new Match(item, ownership, ENTER, "MISSED".equals(status) ? "患者已过号，接诊时先回队" : null,
                    position, outOfTurn);
        }
        if (mine) return new Match(item, ownership, ENTER, null, null, false);
        if (takeoverEnabled) return new Match(item, ownership, CONFIRM_TAKEOVER, "该就诊正由其他医生接诊", null, false);
        return new Match(item, ownership, VIEW_ONLY, "该就诊正由其他医生接诊，当前科室未启用接管", null, false);
    }

    private static int position(ReceptionQueueItem item, List<ReceptionQueueItem> all) {
        long ahead = all.stream()
                .filter(other -> other.serviceQueueId() != null && other.serviceQueueId().equals(item.serviceQueueId()))
                .filter(other -> WAITING.contains(other.status()) && !other.registrationId().equals(item.registrationId()))
                .filter(other -> other.priority() > item.priority()
                        || other.priority() == item.priority() && other.sequenceNo() < item.sequenceNo())
                .count();
        return (int) ahead + 1;
    }

    private boolean takeoverEnabled(ExecutionContext context) {
        var enabled = configuration.resolveCurrent(context.tenantId(), null, context.organizationId(),
                context.departmentId(), EncounterService.TAKEOVER_ENABLED_KEY);
        return enabled == null || enabled.value() == null || enabled.value().isNull() || enabled.value().asBoolean(true);
    }
}
