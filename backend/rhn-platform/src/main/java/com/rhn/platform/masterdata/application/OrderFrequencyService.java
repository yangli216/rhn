package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.OrderFrequencyCommands.*;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyViews.*;
import com.rhn.platform.masterdata.domain.OrderFrequency;
import com.rhn.platform.masterdata.domain.OrderFrequencyConfiguration;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.OrderFrequencyConfigurationRepository;
import com.rhn.platform.masterdata.infrastructure.OrderFrequencyRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.*;

import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class OrderFrequencyService implements OrderFrequencyDirectory {
    private final OrderFrequencyRepository frequencies;
    private final OrderFrequencyConfigurationRepository configurations;
    private final MedicationRepository medications;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contextProvider;
    private final MedicationSemanticsService semantics;

    public OrderFrequencyService(OrderFrequencyRepository frequencies,
            OrderFrequencyConfigurationRepository configurations, MedicationRepository medications,
            OrganizationDirectory organizations, ExecutionContextProvider contextProvider, MedicationSemanticsService semantics) {
        this.semantics = semantics;
        this.frequencies = frequencies; this.configurations = configurations; this.medications = medications;
        this.organizations = organizations; this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<FrequencyView> list(String query, String status) {
        Long tenantId = current().tenantId(); String q = text(query);
        return frequencies.findByTenantIdOrderBySortOrderAscNameAsc(tenantId).stream()
                .filter(v -> text(status) == null || status.equals(v.status()))
                .filter(v -> q == null || matches(q, v.code(), v.name(), v.shortName(), v.description()))
                .map(v -> view(v, configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(tenantId, v.id())))
                .toList();
    }

    @Transactional
    public FrequencyView create(FrequencyCommand command) {
        ExecutionContext context = current(); validateCommand(command);
        String code = command.code().trim().toUpperCase(Locale.ROOT);
        if (frequencies.existsByTenantIdAndCodeIgnoreCase(context.tenantId(), code)) throw conflict("ORDER_FREQUENCY_CODE_DUPLICATE", "当前租户已存在相同频次编码");
        OrderFrequency value = new OrderFrequency(context.tenantId(), context.subjectId(), code,
                command.name(), command.shortName(), command.description(), upper(command.ruleType()),
                command.frequencyCount(), command.periodValue(), upper(command.periodUnit()),
                upper(command.anchorType()), normalizeTimes(command.defaultExecutionTimes()),
                command.outpatientApplicable(), command.inpatientApplicable(), command.emergencyApplicable(),
                command.medicationApplicable(), command.treatmentApplicable(), command.nursingApplicable(),
                command.automaticTaskGeneration(), command.sortOrder(), upper(command.status()),
                command.validFrom(), command.validTo());
        frequencies.save(value);
        capture(value);
        return view(value, List.of());
    }

    @Transactional
    public FrequencyView update(Long id, long expectedRevision, FrequencyCommand command) {
        ExecutionContext context = current(); validateCommand(command);
        OrderFrequency value = require(context.tenantId(), id);
        if (value.revision() != expectedRevision) throw conflict("ORDER_FREQUENCY_REVISION_STALE", "医嘱频次已被其他用户修改，请刷新后重试");
        if (!value.code().equalsIgnoreCase(command.code().trim())) throw badRequest("ORDER_FREQUENCY_CODE_IMMUTABLE", "频次编码创建后不允许修改");
        if ("INACTIVE".equals(upper(command.status())) && "ACTIVE".equals(value.status())
                && medications.findByTenantIdOrderByName(context.tenantId()).stream().anyMatch(m -> value.id().equals(m.defaultFrequencyId()) && "ACTIVE".equals(m.status()))) {
            throw conflict("ORDER_FREQUENCY_IN_USE", "该频次仍被有效药品默认频次引用，不能停用");
        }
        capture(value);
        value.update(expectedRevision, context.subjectId(), command.name(), command.shortName(),
                command.description(), upper(command.ruleType()), command.frequencyCount(), command.periodValue(),
                upper(command.periodUnit()), upper(command.anchorType()), normalizeTimes(command.defaultExecutionTimes()),
                command.outpatientApplicable(), command.inpatientApplicable(), command.emergencyApplicable(),
                command.medicationApplicable(), command.treatmentApplicable(), command.nursingApplicable(),
                command.automaticTaskGeneration(), command.sortOrder(), upper(command.status()), command.validFrom(), command.validTo());
        capture(value);
        return view(frequencies.save(value), configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(context.tenantId(), id));
    }

    @Transactional
    public FrequencyView createConfiguration(Long frequencyId, ConfigurationCommand command) {
        ExecutionContext context = current(); OrderFrequency frequency = require(context.tenantId(), frequencyId);
        validateConfiguration(context.tenantId(), frequency, null, command);
        OrderFrequencyConfiguration value = configurations.save(new OrderFrequencyConfiguration(
                context.tenantId(), context.subjectId(), command.organizationId(), command.departmentId(),
                frequencyId, command.localCode(), command.localName(), normalizeTimes(command.executionTimes()),
                upper(command.firstDayPolicy()), command.enabled(), upper(command.status()), command.validFrom(), command.validTo()));
        captureConfiguration(value);
        return view(frequency, configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(context.tenantId(), frequencyId));
    }

    @Transactional
    public FrequencyView updateConfiguration(Long frequencyId, Long configurationId, long expectedRevision,
            ConfigurationCommand command) {
        ExecutionContext context = current(); OrderFrequency frequency = require(context.tenantId(), frequencyId);
        OrderFrequencyConfiguration value = configurations.findByIdAndTenantId(configurationId, context.tenantId())
                .filter(v -> frequencyId.equals(v.frequencyId()))
                .orElseThrow(() -> notFound("ORDER_FREQUENCY_CONFIG_NOT_FOUND", "未找到频次执行配置"));
        if (value.revision() != expectedRevision) throw conflict("ORDER_FREQUENCY_CONFIG_REVISION_STALE", "频次执行配置已被其他用户修改，请刷新后重试");
        if (!Objects.equals(value.organizationId(), command.organizationId()) || !Objects.equals(value.departmentId(), command.departmentId())) {
            throw badRequest("ORDER_FREQUENCY_CONFIG_SCOPE_IMMUTABLE", "配置范围创建后不允许修改");
        }
        validateConfiguration(context.tenantId(), frequency, configurationId, command);
        captureConfiguration(value);
        value.update(expectedRevision, context.subjectId(), command.localCode(), command.localName(),
                normalizeTimes(command.executionTimes()), upper(command.firstDayPolicy()), command.enabled(),
                upper(command.status()), command.validFrom(), command.validTo());
        configurations.save(value);
        captureConfiguration(value);
        return view(frequency, configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(context.tenantId(), frequencyId));
    }

    @Transactional(readOnly = true)
    public SchedulePreview preview(String code, Long organizationId, Long departmentId,
            LocalDateTime start, int occurrences) {
        ExecutionContext context = current(); LocalDateTime anchor = start == null ? LocalDateTime.now() : start;
        FrequencySnapshot frequency = requireActive(context.tenantId(), code, organizationId, departmentId,
                "OUTPATIENT", "MEDICATION", anchor.toLocalDate());
        int limit = Math.max(1, Math.min(occurrences, 30));
        if (!frequency.automaticTaskGeneration()) return new SchedulePreview(frequency.code(), frequency.name(),
                frequency.ruleType(), Set.of("PRN", "CONTINUOUS").contains(frequency.ruleType())
                ? "该频次不预生成固定执行时点" : "当前频次关闭自动任务生成", List.of());
        List<LocalDateTime> planned = switch (frequency.ruleType()) {
            case "ONCE" -> List.of(anchor);
            case "FIXED_INTERVAL" -> intervalPlan(anchor, frequency.periodValue(), frequency.periodUnit(), limit);
            case "TIMES_PER_PERIOD", "CALENDAR" -> standardTimePlan(anchor, frequency.executionTimes(), frequency.firstDayPolicy(), limit);
            default -> List.of();
        };
        return new SchedulePreview(frequency.code(), frequency.name(), frequency.ruleType(), explanation(frequency), planned);
    }

    @Override
    @Transactional(readOnly = true)
    public FrequencySnapshot requireActive(Long tenantId, String code, Long organizationId, Long departmentId,
            String scene, String orderType, LocalDate businessDate) {
        if (text(code) == null) throw badRequest("ORDER_FREQUENCY_REQUIRED", "医嘱频次不能为空");
        OrderFrequency value = frequencies.findByTenantIdAndCodeIgnoreCase(tenantId, code.trim())
                .orElseThrow(() -> badRequest("ORDER_FREQUENCY_INVALID", "医嘱频次不存在：" + code));
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        if (!value.effective(date)) throw badRequest("ORDER_FREQUENCY_INACTIVE", "医嘱频次未启用或不在有效期内");
        if (!value.applicable(scene, orderType)) throw badRequest("ORDER_FREQUENCY_NOT_APPLICABLE", "医嘱频次不适用于当前业务场景");
        OrderFrequencyConfiguration config = resolveConfig(tenantId, value.id(), organizationId, departmentId, date);
        if (config != null && !config.enabled()) throw badRequest("ORDER_FREQUENCY_SCOPE_DISABLED", "当前机构或科室未启用该医嘱频次");
        return snapshot(value, config);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FrequencySnapshot> active(Long tenantId, Long organizationId, Long departmentId,
            String scene, String orderType, LocalDate businessDate) {
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        return frequencies.findByTenantIdOrderBySortOrderAscNameAsc(tenantId).stream()
                .filter(v -> v.effective(date) && v.applicable(scene, orderType))
                .map(v -> enabledSnapshot(v, resolveConfig(tenantId, v.id(), organizationId, departmentId, date)))
                .filter(Objects::nonNull).toList();
    }

    private void capture(OrderFrequency value) {
        semantics.captureDefinition("FREQUENCY_DEFINITION", value.id().toString(), view(value, List.of()),
                "revision", "code", "name", "shortName", "description", "sortOrder", "configurations");
    }

    private void captureConfiguration(OrderFrequencyConfiguration value) {
        semantics.captureDefinition("FREQUENCY_CONFIGURATION", value.id().toString(), configurationView(value),
                "revision", "localCode", "localName");
    }

    private void validateCommand(FrequencyCommand command) {
        List<String> times = splitTimes(normalizeTimes(command.defaultExecutionTimes()));
        String ruleType = upper(command.ruleType()); String anchorType = upper(command.anchorType());
        String periodUnit = upper(command.periodUnit()); String status = upper(command.status());
        if (!Set.of("ONCE", "TIMES_PER_PERIOD", "FIXED_INTERVAL", "CALENDAR", "PRN", "CONTINUOUS").contains(ruleType))
            throw badRequest("ORDER_FREQUENCY_RULE_TYPE_INVALID", "不支持的频次规则类型");
        if (!Set.of("ORDER_START", "STANDARD_TIME", "CALENDAR", "EVENT").contains(anchorType))
            throw badRequest("ORDER_FREQUENCY_ANCHOR_TYPE_INVALID", "不支持的频次锚点类型");
        if (periodUnit != null && !Set.of("MIN", "H", "D", "WK", "MO").contains(periodUnit))
            throw badRequest("ORDER_FREQUENCY_PERIOD_UNIT_INVALID", "不支持的频次周期单位");
        if (!Set.of("ACTIVE", "INACTIVE").contains(status))
            throw badRequest("ORDER_FREQUENCY_STATUS_INVALID", "频次状态不正确");
        if (command.validFrom() == null || command.validTo() != null && command.validTo().isBefore(command.validFrom()))
            throw badRequest("ORDER_FREQUENCY_PERIOD_INVALID", "频次生效日期不能为空，且失效日期不能早于生效日期");
        if (Set.of("TIMES_PER_PERIOD", "FIXED_INTERVAL").contains(ruleType)
                && (command.frequencyCount() == null || command.periodValue() == null || periodUnit == null))
            throw badRequest("ORDER_FREQUENCY_PERIOD_REQUIRED", "周期频次必须配置次数、周期值和周期单位");
        if ("STANDARD_TIME".equals(anchorType) && times.isEmpty())
            throw badRequest("ORDER_FREQUENCY_EXECUTION_TIMES_REQUIRED", "标准时点频次必须配置默认执行时间");
        if ("TIMES_PER_PERIOD".equals(ruleType) && command.frequencyCount() != null
                && times.size() != command.frequencyCount())
            throw badRequest("ORDER_FREQUENCY_EXECUTION_TIME_COUNT_INVALID", "默认执行时间数量必须与周期执行次数一致");
        if ("FIXED_INTERVAL".equals(ruleType) && command.periodValue() != null) {
            try { command.periodValue().setScale(0, RoundingMode.UNNECESSARY).longValueExact(); }
            catch (ArithmeticException exception) { throw badRequest("ORDER_FREQUENCY_PERIOD_VALUE_INVALID", "固定间隔的周期值必须为整数"); }
        }
        if (!command.outpatientApplicable() && !command.inpatientApplicable() && !command.emergencyApplicable()) throw badRequest("ORDER_FREQUENCY_SCENE_REQUIRED", "频次至少适用于一个医疗场景");
        if (!command.medicationApplicable() && !command.treatmentApplicable() && !command.nursingApplicable()) throw badRequest("ORDER_FREQUENCY_ORDER_TYPE_REQUIRED", "频次至少适用于一种医嘱类型");
    }
    private void validateConfiguration(Long tenantId, OrderFrequency frequency, Long currentId, ConfigurationCommand command) {
        if (command.validFrom() == null || command.validTo() != null && command.validTo().isBefore(command.validFrom())) throw badRequest("ORDER_FREQUENCY_CONFIG_PERIOD_INVALID", "配置生效日期不能为空，且失效日期不能早于生效日期");
        organizations.requireOrganization(tenantId, command.organizationId());
        if (command.departmentId() != null) organizations.requireDepartment(tenantId, command.organizationId(), command.departmentId());
        String times = normalizeTimes(command.executionTimes());
        String effectiveTimes = text(times) == null ? frequency.defaultExecutionTimes() : times;
        if ("STANDARD_TIME".equals(frequency.anchorType()) && text(effectiveTimes) == null) throw badRequest("ORDER_FREQUENCY_EXECUTION_TIMES_REQUIRED", "标准时点频次必须配置执行时间");
        if ("TIMES_PER_PERIOD".equals(frequency.ruleType()) && frequency.frequencyCount() != null
                && splitTimes(effectiveTimes).size() != frequency.frequencyCount()) throw badRequest("ORDER_FREQUENCY_EXECUTION_TIME_COUNT_INVALID", "执行时间数量必须与周期执行次数一致");
        String scope = OrderFrequencyConfiguration.scopeKey(command.organizationId(), command.departmentId());
        boolean overlap = configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(tenantId, frequency.id()).stream()
                .filter(v -> !Objects.equals(v.id(), currentId) && scope.equals(v.scopeKey()))
                .anyMatch(v -> overlaps(v.validFrom(), v.validTo(), command.validFrom(), command.validTo()));
        if (overlap) throw conflict("ORDER_FREQUENCY_CONFIG_PERIOD_OVERLAP", "相同范围的频次配置有效期不能重叠");
    }
    private OrderFrequencyConfiguration resolveConfig(Long tenantId, Long frequencyId, Long organizationId,
            Long departmentId, LocalDate date) {
        if (organizationId == null) return null;
        List<OrderFrequencyConfiguration> values = configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(tenantId, frequencyId);
        if (departmentId != null) {
            Optional<OrderFrequencyConfiguration> department = values.stream().filter(v -> Objects.equals(departmentId, v.departmentId()) && v.effective(date)).findFirst();
            if (department.isPresent()) return department.get();
        }
        return values.stream().filter(v -> v.departmentId() == null && Objects.equals(organizationId, v.organizationId()) && v.effective(date)).findFirst().orElse(null);
    }
    private FrequencySnapshot snapshot(OrderFrequency value, OrderFrequencyConfiguration config) {
        return new FrequencySnapshot(value.id(), value.revision(), value.code(),
                config != null && text(config.localName()) != null ? config.localName() : value.name(),
                value.shortName(), value.description(), value.ruleType(), value.frequencyCount(),
                value.periodValue(), value.periodUnit(), value.anchorType(), splitTimes(config != null && text(config.executionTimes()) != null ? config.executionTimes() : value.defaultExecutionTimes()),
                config == null ? "REMAINING_SLOTS" : config.firstDayPolicy(), value.automaticTaskGeneration());
    }
    private FrequencySnapshot enabledSnapshot(OrderFrequency value, OrderFrequencyConfiguration config) {
        return config != null && !config.enabled() ? null : snapshot(value, config);
    }
    private FrequencyView view(OrderFrequency value, List<OrderFrequencyConfiguration> configs) {
        return new FrequencyView(value.id(), value.revision(), value.code(), value.name(), value.shortName(),
                value.description(), value.ruleType(), value.frequencyCount(), value.periodValue(), value.periodUnit(),
                value.anchorType(), splitTimes(value.defaultExecutionTimes()), value.outpatientApplicable(),
                value.inpatientApplicable(), value.emergencyApplicable(), value.medicationApplicable(),
                value.treatmentApplicable(), value.nursingApplicable(), value.automaticTaskGeneration(),
                value.sortOrder(), value.status(), value.validFrom(), value.validTo(), configs.stream().map(this::configurationView).toList());
    }
    private ConfigurationView configurationView(OrderFrequencyConfiguration value) { return new ConfigurationView(
            value.id(), value.revision(), value.organizationId(), value.departmentId(), value.frequencyId(),
            value.localCode(), value.localName(), splitTimes(value.executionTimes()), value.firstDayPolicy(),
            value.enabled(), value.status(), value.validFrom(), value.validTo()); }
    private OrderFrequency require(Long tenantId, Long id) { return frequencies.findByIdAndTenantId(id, tenantId).orElseThrow(() -> notFound("ORDER_FREQUENCY_NOT_FOUND", "未找到医嘱频次")); }
    private ExecutionContext current() { return contextProvider.requireCurrent(); }
    private static String upper(String value) { return text(value) == null ? null : value.trim().toUpperCase(Locale.ROOT); }
    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static boolean matches(String query, String... values) { String q = query.toLowerCase(Locale.ROOT); return Arrays.stream(values).filter(Objects::nonNull).anyMatch(v -> v.toLowerCase(Locale.ROOT).contains(q)); }
    private static boolean overlaps(LocalDate aStart, LocalDate aEnd, LocalDate bStart, LocalDate bEnd) { return (aEnd == null || !aEnd.isBefore(bStart)) && (bEnd == null || !bEnd.isBefore(aStart)); }
    private static String normalizeTimes(String value) { if (text(value) == null) return null; List<String> times = splitTimes(value); if (times.size() != new LinkedHashSet<>(times).size()) throw badRequest("ORDER_FREQUENCY_EXECUTION_TIME_DUPLICATE", "执行时间不能重复"); return String.join(",", times); }
    private static List<String> splitTimes(String value) { if (text(value) == null) return List.of(); return Arrays.stream(value.split("[,，;；\\s]+")) .filter(v -> !v.isBlank()).map(v -> { try { return LocalTime.parse(v.trim()).toString(); } catch (DateTimeException e) { throw badRequest("ORDER_FREQUENCY_EXECUTION_TIME_INVALID", "执行时间格式应为 HH:mm"); } }).sorted().toList(); }
    private static List<LocalDateTime> intervalPlan(LocalDateTime start, BigDecimal value, String unit, int count) { List<LocalDateTime> rows = new ArrayList<>(); LocalDateTime at = start; for (int i = 0; i < count; i++) { rows.add(at); at = plus(at, value, unit); } return rows; }
    private static LocalDateTime plus(LocalDateTime value, BigDecimal amount, String unit) { long whole = amount.setScale(0, RoundingMode.UNNECESSARY).longValueExact(); return switch (unit) { case "MIN" -> value.plusMinutes(whole); case "H" -> value.plusHours(whole); case "D" -> value.plusDays(whole); case "WK" -> value.plusWeeks(whole); case "MO" -> value.plusMonths(whole); default -> throw badRequest("ORDER_FREQUENCY_PERIOD_UNIT_INVALID", "不支持的周期单位"); }; }
    private static List<LocalDateTime> standardTimePlan(LocalDateTime start, List<String> values, String policy, int count) { if (values.isEmpty()) throw badRequest("ORDER_FREQUENCY_EXECUTION_TIMES_REQUIRED", "当前频次未配置执行时间"); List<LocalTime> times = values.stream().map(LocalTime::parse).toList(); List<LocalDateTime> result = new ArrayList<>(); LocalDate date = start.toLocalDate(); while (result.size() < count) { for (LocalTime time : times) { LocalDateTime candidate = date.atTime(time); if ("FULL_SCHEDULE".equals(policy) || !candidate.isBefore(start)) { result.add(candidate); if (result.size() == count) break; } } date = date.plusDays(1); } return result; }
    private static String explanation(FrequencySnapshot value) { return switch (value.ruleType()) { case "ONCE" -> "按医嘱开始时间执行一次"; case "FIXED_INTERVAL" -> "从医嘱开始时间按固定间隔生成"; case "TIMES_PER_PERIOD", "CALENDAR" -> "按机构或科室标准执行时间生成"; default -> "不预生成固定执行时点"; }; }
}
