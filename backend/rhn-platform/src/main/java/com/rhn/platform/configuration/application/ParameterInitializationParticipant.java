package com.rhn.platform.configuration.application;

import com.rhn.platform.configuration.api.ParameterInitializationOptions;
import com.rhn.platform.configuration.api.ParameterInitializationOptions.ParameterOption;
import com.rhn.platform.configuration.domain.*;
import com.rhn.platform.configuration.infrastructure.ConfigurationDefinitionRepository;
import com.rhn.platform.configuration.infrastructure.ParameterValueRepository;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceParticipant;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.*;

/** Uses the normal parameter command path; existing values and sensitive settings are never overwritten. */
@Component
public class ParameterInitializationParticipant implements MaintenanceParticipant {
    private final ConfigurationDefinitionRepository definitions;
    private final ParameterValueRepository values;
    private final ConfigurationApplicationService service;
    private final JsonCodec json;

    public ParameterInitializationParticipant(ConfigurationDefinitionRepository definitions,
                                              ParameterValueRepository values,
                                              ConfigurationApplicationService service, JsonCodec json) {
        this.definitions = definitions; this.values = values; this.service = service; this.json = json;
    }
    @Override public Dataset dataset() {
        return new Dataset("PARAMETER_DEFAULTS", "普通机构参数补齐", Set.of(Operation.INITIALIZE),
                Set.of("CONFIGURATION"), "1");
    }
    public ParameterInitializationOptions options(ExecutionContext actor) {
        authorize(actor);
        return new ParameterInitializationOptions(candidates().stream()
                .map(value -> new ParameterOption(value.configKey(), value.name(), value.valueType().name())).toList());
    }
    @Override public void validateTestRoots(ExecutionContext actor, Scope scope, List<Root> roots, String evidence) {
        throw badRequest("MAINTENANCE_BATCH_UNSUPPORTED", "参数初始化不登记测试业务批次");
    }
    @Override public PreparedChange preview(ExecutionContext actor, Scope scope, Operation operation,
                                           Set<String> modules, List<Root> roots, String inputJson) {
        authorize(actor);
        Input input = json.read(inputJson, Input.class);
        if (input.keys() == null || input.keys().isEmpty())
            throw badRequest("PARAMETER_INITIALIZATION_KEYS_REQUIRED", "请选择要补齐的普通机构参数");
        var available = candidates();
        if (available.stream().filter(value -> input.keys().contains(value.configKey())).count() != input.keys().size())
            throw badRequest("PARAMETER_INITIALIZATION_KEY_INVALID", "所选参数不存在、已停用或不允许普通机构初始化");
        List<Action> actions = new ArrayList<>();
        for (Long organization : scope.organizationIds()) {
            for (var definition : available) {
                if (!input.keys().contains(definition.configKey())) continue;
                var existing = values.findByDefinitionIdAndScopeCode(definition.id(), "ORGANIZATION:" + organization).orElse(null);
                actions.add(new Action(definition.id(), definition.revision(), definition.configKey(), definition.name(),
                        organization, definition.defaultValueJson(), existing == null ? null : existing.id(),
                        existing == null ? null : existing.revision(),
                        existing == null ? null : existing.valueMode().name(),
                        existing == null ? null : existing.valueJson()));
            }
        }
        long creates = actions.stream().filter(action -> action.existingId() == null).count();
        return new PreparedChange(json.write(new Plan(actions)),
                List.of(new Impact("CONFIGURATION", "补齐机构参数", creates, creates, "CREATE"),
                        new Impact("CONFIGURATION", "已有机构参数", actions.size() - creates, actions.size() - creates, "KEEP")),
                List.of(), List.of("已有参数值及修订", "敏感参数和凭据", "租户/平台默认值", "参数定义与字典"),
                actions.stream().map(action -> new PreviewLine("CONFIGURATION", action.organizationId(), action.key(),
                        action.name(), action.existingId() == null ? "CREATE" : "KEEP",
                        action.existingJson(), action.existingId() == null ? action.defaultJson() : action.existingJson(),
                        action.existingId() == null ? "按系统默认值补齐" : "已有参数保留", null)).toList());
    }
    @Override public String backup(ExecutionContext actor, Scope scope, PreparedChange change) { return change.payloadJson(); }
    @Override public void apply(ExecutionContext actor, Scope scope, PreparedChange change) {
        authorize(actor);
        for (Action action : json.read(change.payloadJson(), Plan.class).actions()) {
            if (action.existingId() != null) continue;
            String command = "maint-param-" + com.rhn.shared.id.GlobalIds.next();
            service.saveValue(action.definitionId(), new ConfigurationApplicationService.ValueCommand(
                    null, ConfigurationScope.ORGANIZATION, action.organizationId(), action.organizationId(), null,
                    ConfigurationValueMode.OVERRIDE, action.defaultJson(), null,
                    "上线前补齐普通机构参数；已有值保留", command));
        }
    }
    @Override public void verify(ExecutionContext actor, Scope scope, PreparedChange change) {
        values.flush();
        for (Action action : json.read(change.payloadJson(), Plan.class).actions()) {
            var value = values.findByDefinitionIdAndScopeCode(action.definitionId(), "ORGANIZATION:" + action.organizationId())
                    .orElseThrow(() -> conflict("PARAMETER_INITIALIZATION_VERIFY_FAILED", "机构参数补齐校验失败"));
            if (action.existingId() == null) {
                if (!java.util.Objects.equals(value.valueJson(), action.defaultJson()))
                    throw conflict("PARAMETER_INITIALIZATION_VERIFY_FAILED", "补齐参数值与预览不一致");
            } else if (!value.id().equals(action.existingId()) || !value.revision().equals(action.existingRevision())) {
                throw conflict("PARAMETER_INITIALIZATION_PRESERVATION_FAILED", "已有机构参数发生非预期变化");
            }
        }
    }
    @Override public void afterCommit(ExecutionContext actor, Scope scope, PreparedChange change) {
        // The existing parameter service invalidates its cache after the database transaction commits.
    }
    private List<ConfigurationDefinition> candidates() {
        return definitions.findAllByOrderByUpdatedAtDesc().stream()
                .filter(value -> value.status() == ConfigurationStatus.ACTIVE
                        && value.sensitivity() == ConfigurationSensitivity.NORMAL
                        && value.allows(ConfigurationScope.ORGANIZATION)
                        && value.defaultValueJson() != null
                        && !value.configKey().startsWith("clinical.ai."))
                .sorted(Comparator.comparing(ConfigurationDefinition::configKey)).toList();
    }
    private void authorize(ExecutionContext actor) {
        if (!actor.hasAuthority("CONFIGURATION.ACCESS"))
            throw forbidden("PARAMETER_INITIALIZATION_FORBIDDEN", "参数初始化还需参数管理权限");
    }
    public record Input(Set<String> keys) {}
    public record Plan(List<Action> actions) {}
    public record Action(Long definitionId, Long definitionRevision, String key, String name, Long organizationId,
                         String defaultJson, Long existingId, Long existingRevision, String existingMode, String existingJson) {}
}
