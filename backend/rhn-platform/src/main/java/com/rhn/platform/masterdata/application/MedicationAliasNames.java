package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.domain.MedicationAlias;
import com.rhn.platform.masterdata.infrastructure.MedicationAliasRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 药品别名的只读拼接视图：下游（标准目录匹配、AI 候选匹配、处方库存展示）仍按单个字符串读取别名，
 * 以全角分号拼接——标准目录按“；”拆分为精确线索，AI 匹配按逗号、分号、空白拆分，均可还原。
 */
@Component
public class MedicationAliasNames {
    public static final String SEPARATOR = "；";

    /** 把用户录入或导入的别名文本拆成去重（忽略大小写）后的名称，保持录入顺序。 */
    public static List<String> parse(String text) {
        if (text == null || text.isBlank()) return List.of();
        Map<String, String> unique = new LinkedHashMap<>();
        for (String part : text.split("[,，;；、\\n]")) {
            String name = part.trim();
            if (!name.isEmpty()) unique.putIfAbsent(name.toUpperCase(java.util.Locale.ROOT), name);
        }
        return List.copyOf(unique.values());
    }

    private final MedicationAliasRepository aliases;

    public MedicationAliasNames(MedicationAliasRepository aliases) { this.aliases = aliases; }

    public Map<Long, String> joined(Long tenantId, Collection<Long> medicationIds) {
        if (medicationIds == null || medicationIds.isEmpty()) return Map.of();
        Map<Long, List<String>> byMedication = aliases
                .findByTenantIdAndMedicationIdInAndStatusOrderByAliasName(tenantId, medicationIds, "ACTIVE").stream()
                .collect(Collectors.groupingBy(MedicationAlias::medicationId, LinkedHashMap::new,
                        Collectors.mapping(MedicationAlias::aliasName, Collectors.toList())));
        Map<Long, String> result = new LinkedHashMap<>();
        byMedication.forEach((id, names) -> result.put(id, String.join(SEPARATOR, names)));
        return result;
    }

    public String joined(Long tenantId, Long medicationId) {
        return joined(tenantId, List.of(medicationId)).get(medicationId);
    }

    /** 按租户一次读取全部启用别名，供不限定药品范围的列表筛选使用，避免 IN 列表过长。 */
    public Map<Long, String> joinedForTenant(Long tenantId) {
        Map<Long, List<String>> byMedication = aliases
                .findByTenantIdAndStatusOrderByAliasName(tenantId, "ACTIVE").stream()
                .collect(Collectors.groupingBy(MedicationAlias::medicationId, LinkedHashMap::new,
                        Collectors.mapping(MedicationAlias::aliasName, Collectors.toList())));
        Map<Long, String> result = new LinkedHashMap<>();
        byMedication.forEach((id, names) -> result.put(id, String.join(SEPARATOR, names)));
        return result;
    }
}
