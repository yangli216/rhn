package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemAliasCommands.ItemAliasCommand;
import com.rhn.platform.masterdata.api.MedicationAliasViews.MedicationAliasView;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.domain.MedicationAlias;
import com.rhn.platform.masterdata.infrastructure.MedicationAliasRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.search.application.SearchEntryProjectionService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** 通用药品别名维护：整组替换保存，保存后同步检索表，由检索表按别名逐行生成拼音与五笔码。 */
@Service
public class MedicationAliasApplicationService {
    private final MedicationAliasRepository aliases;
    private final MedicationRepository medications;
    private final SearchEntryProjectionService searchProjections;
    private final ExecutionContextProvider contextProvider;

    public MedicationAliasApplicationService(MedicationAliasRepository aliases, MedicationRepository medications,
                                             SearchEntryProjectionService searchProjections,
                                             ExecutionContextProvider contextProvider) {
        this.aliases = aliases;
        this.medications = medications;
        this.searchProjections = searchProjections;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<MedicationAliasView> list(Long medicationId) {
        ExecutionContext context = current();
        requireMedication(context.tenantId(), medicationId);
        return aliases.findByTenantIdAndMedicationIdAndStatusOrderByAliasName(
                context.tenantId(), medicationId, "ACTIVE").stream().map(this::view).toList();
    }

    @Transactional
    public List<MedicationAliasView> replace(Long medicationId, Collection<ItemAliasCommand> commands) {
        ExecutionContext context = current();
        Medication medication = requireMedication(context.tenantId(), medicationId);
        List<ItemAliasCommand> values = commands == null ? List.of() : commands.stream().toList();
        if (values.stream().anyMatch(value -> value == null || value.aliasName() == null || value.aliasName().isBlank())) {
            throw badRequest("MEDICATION_ALIAS_NAME_REQUIRED", "药品别名不能为空");
        }
        if (values.stream().map(value -> value.aliasName().trim().toUpperCase(Locale.ROOT)).distinct().count() != values.size()) {
            throw badRequest("MEDICATION_ALIAS_DUPLICATE", "药品别名不能重复");
        }
        if (values.stream().anyMatch(value -> value.status() == null || !Set.of("ACTIVE", "INACTIVE").contains(value.status()))) {
            throw badRequest("MEDICATION_ALIAS_STATUS_INVALID", "药品别名状态无效");
        }
        // Hibernate inserts before entity deletes; flush removals before reusing alias unique keys.
        aliases.deleteAll(aliases.findByTenantIdAndMedicationIdOrderByAliasName(context.tenantId(), medicationId));
        aliases.flush();
        List<MedicationAlias> saved = aliases.saveAll(values.stream().map(value -> new MedicationAlias(
                context.tenantId(), medicationId, value.aliasType(), value.aliasName().trim(), null,
                value.primaryAlias(), value.status())).toList());
        searchProjections.synchronizeMedication(medication, context.subjectId());
        return saved.stream().map(this::view).toList();
    }

    private MedicationAliasView view(MedicationAlias value) {
        return new MedicationAliasView(value.id(), value.medicationId(), value.aliasType(), value.aliasName(),
                value.primaryAlias(), value.status());
    }

    private Medication requireMedication(Long tenantId, Long id) {
        if (id == null) throw notFound("MEDICATION_NOT_FOUND", "未找到通用药品");
        return medications.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到通用药品"));
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
    }
}
