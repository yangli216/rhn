package com.rhn.outpatient.encounter;

import com.rhn.outpatient.api.DirectVisitBillingDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.RegistrationValidityPolicy;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.idempotency.IdempotencyService;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class DirectVisitService {
    public static final String ENABLED_KEY = "outpatient.direct-visit.enabled";
    public static final String SERVICE_KEY = "outpatient.direct-visit.catalog-item-id";
    private static final String OPERATION = "OUTPATIENT.DIRECT_VISIT";
    private final EncounterService encounters;
    private final EncounterRepository repository;
    private final ResidentDirectory residents;
    private final OutpatientRegistrationDirectory registrations;
    private final DirectVisitBillingDirectory billing;
    private final RegistrationValidityPolicy validity;
    private final ConfigurationDirectory configuration;
    private final ExecutionContextProvider contexts;
    private final IdempotencyService idempotency;
    private final JsonCodec json;
    private final jakarta.persistence.EntityManager entityManager;
    private final DomainEventPublisher events;

    public DirectVisitService(EncounterService encounters, EncounterRepository repository, ResidentDirectory residents,
            OutpatientRegistrationDirectory registrations, DirectVisitBillingDirectory billing,
            RegistrationValidityPolicy validity, ConfigurationDirectory configuration, ExecutionContextProvider contexts,
            IdempotencyService idempotency, JsonCodec json, jakarta.persistence.EntityManager entityManager,
            DomainEventPublisher events) {
        this.encounters = encounters; this.repository = repository; this.residents = residents;
        this.registrations = registrations; this.billing = billing; this.validity = validity;
        this.configuration = configuration; this.contexts = contexts; this.idempotency = idempotency; this.json = json;
        this.entityManager = entityManager; this.events = events;
    }

    public record Settings(boolean enabled, Long catalogItemId) {}
    public record Request(@NotNull Long residentId, Long encounterId,
                          @NotBlank @Size(max = 96) String commandCode,
                          @NotEmpty Map<String, Boolean> factorResults,
                          @Size(max = 128) String terminalCode) {}
    public record Result(String outcome, EncounterResponse encounter, List<EncounterResponse> candidates) {}

    @Transactional(readOnly = true)
    public Settings settings() { return settings(requireContext()); }

    private Settings settings(ExecutionContext context) {
        var enabled = configuration.resolveCurrent(context.tenantId(), null, context.organizationId(),
                context.departmentId(), ENABLED_KEY);
        var service = configuration.resolveCurrent(context.tenantId(), null, context.organizationId(),
                context.departmentId(), SERVICE_KEY);
        Long catalogItemId = null;
        if (service != null && service.value() != null && !service.value().isNull()) {
            String value = service.value().asString().trim();
            if (!value.isBlank()) {
                try { catalogItemId = Long.valueOf(value); }
                catch (NumberFormatException e) { throw badRequest("DIRECT_VISIT_SERVICE_INVALID", "科室直接接诊门诊服务参数必须为有效的服务项目标识"); }
            }
        }
        return new Settings(enabled != null && enabled.value() != null && enabled.value().asBoolean(false), catalogItemId);
    }

    @Transactional
    public Result receive(Request request) {
        var context = requireContext();
        var factors = request.factorResults();
        if (!Boolean.TRUE.equals(factors.get("NAME")) || factors.size() < 2
                || factors.values().stream().anyMatch(value -> !Boolean.TRUE.equals(value))) {
            throw badRequest("ENCOUNTER_IDENTITY_CHECK_FAILED", "请核对患者姓名和至少一项附加身份信息后接诊");
        }
        // Serialize all registration attempts for the same resident, including normal window registration.
        var resident = residents.requireSnapshotForUpdate(request.residentId());
        if (resident.deceased()) throw conflict("RESIDENT_DECEASED", "已登记死亡的居民不能发起普通门诊接诊");
        var active = repository.findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                context.tenantId(), resident.id(), context.organizationId(), context.departmentId(),
                List.of(EncounterStatus.REGISTERED, EncounterStatus.IN_PROGRESS, EncounterStatus.SUSPENDED))
                .stream().filter(value -> validity.isValid(value.registeredAt(), Instant.now(), context.tenantId(),
                        context.subjectId(), context.organizationId(), context.departmentId())).toList();
        if (request.encounterId() == null && active.size() > 1) {
            return new Result("SELECT_REGISTRATION", null, active.stream().map(value -> encounters.get(value.id())).toList());
        }
        String canonical = json.write(Map.of("request", request, "organizationId", context.organizationId(),
                "departmentId", context.departmentId(), "subjectId", context.subjectId()));
        var reservation = idempotency.reserve(OPERATION, request.commandCode(), canonical);
        if (reservation.replay()) {
            return new Result("REUSED", encounters.get(reservation.resourceId()), List.of());
        }
        Encounter selected = request.encounterId() == null ? (active.isEmpty() ? null : active.getFirst())
                : active.stream().filter(value -> value.id().equals(request.encounterId())).findFirst()
                    .orElseThrow(() -> conflict("DIRECT_VISIT_SELECTION_EXPIRED", "所选挂号不再有效，请重新识别患者"));
        boolean created = selected == null;
        Long encounterId;
        Long serviceId = null;
        if (created) {
            var settings = settings(context);
            serviceId = settings.catalogItemId();
            if (!settings.enabled()) throw conflict("DIRECT_VISIT_DISABLED", "当前科室未启用直接接诊，请先办理挂号");
            billing.requireNoPendingRegistration(resident.id(), context.organizationId(), context.departmentId());
            var registered = encounters.register(new RegisterEncounterRequest(resident.id(), context.organizationId(),
                    context.departmentId(), null, null, null, "DV-" + request.commandCode(), "DIRECT", "GENERAL"));
            encounterId = registered.id();
            billing.chargeService(resident.id(), encounterId, context.organizationId(), context.departmentId(), settings.catalogItemId());
            selected = repository.findByIdAndTenantId(encounterId, context.tenantId()).orElseThrow();
        } else {
            selected = repository.findWithLockByIdAndTenantId(selected.id(), context.tenantId()).orElseThrow();
            entityManager.refresh(selected, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            encounterId = selected.id();
            if (selected.status() != EncounterStatus.REGISTERED && selected.status() != EncounterStatus.IN_PROGRESS
                    && selected.status() != EncounterStatus.SUSPENDED) {
                throw conflict("DIRECT_VISIT_SELECTION_EXPIRED", "该次就诊状态已变化，请重新识别患者");
            }
            if (selected.clinicianId() != null && !selected.clinicianId().equals(context.actor())) {
                throw conflict("DIRECT_VISIT_OTHER_CLINICIAN", "患者已由其他医生接诊，请联系原医生或按流程转诊");
            }
            registrations.requireDirectReceptionAllowed(encounterId);
            billing.requireRegistrationPaid(encounterId);
        }
        EncounterResponse encounter = switch (selected.status()) {
            case REGISTERED -> encounters.start(encounterId, new StartEncounterRequest("DV-START-" + request.commandCode(), factors, request.terminalCode()));
            case SUSPENDED -> encounters.resume(encounterId, new ResumeEncounterRequest("DV-RESUME-" + request.commandCode(), request.terminalCode()));
            default -> encounters.get(encounterId);
        };
        idempotency.complete(OPERATION, request.commandCode(), "ENCOUNTER", encounterId, 200, json.write(encounter));
        var details = new java.util.LinkedHashMap<String, Object>();
        details.put("summary", created ? "医生直接接诊自动挂号" : "医生直接接诊复用挂号");
        details.put("createdRegistration", created);
        details.put("commandCode", request.commandCode());
        details.put("actorId", context.subjectId());
        details.put("departmentId", context.departmentId());
        details.put("serviceParameterKey", SERVICE_KEY);
        if (serviceId != null) details.put("catalogItemId", serviceId);
        events.publish(context.tenantId(), context.organizationId(), "DIRECT_VISIT_RECEIVED", 1,
                "Encounter", encounterId, selected.version(), resident.id(), Instant.now(), details);
        return new Result(created ? "CREATED" : "REUSED", encounter, List.of());
    }

    private ExecutionContext requireContext() {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("OUTPATIENT_RECEPTION.ACCESS") && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("DIRECT_VISIT_FORBIDDEN", "当前用户没有门诊接诊权限");
        }
        if (context.organizationId() == null || context.departmentId() == null || context.practitionerId() == null) {
            throw forbidden("DIRECT_VISIT_CONTEXT_REQUIRED", "请使用医生身份选择接诊机构和科室");
        }
        return context;
    }
}
