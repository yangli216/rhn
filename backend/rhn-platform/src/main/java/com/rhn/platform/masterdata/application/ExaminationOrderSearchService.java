package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ExaminationOrderSearchDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.masterdata.infrastructure.ServiceVariantRepository;
import com.rhn.platform.search.application.SearchCodeGenerator;
import com.rhn.platform.search.infrastructure.ExaminationSearchEntryRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class ExaminationOrderSearchService implements ExaminationOrderSearchDirectory {
    private static final int RESULT_LIMIT = 30;
    private final ExaminationSearchEntryRepository entries;
    private final ServiceVariantRepository variants;
    private final ServiceCatalogDirectory catalog;
    private final SearchCodeGenerator generator;
    private final ExecutionContextProvider contexts;

    public ExaminationOrderSearchService(ExaminationSearchEntryRepository entries, ServiceVariantRepository variants,
            ServiceCatalogDirectory catalog, SearchCodeGenerator generator, ExecutionContextProvider contexts) {
        this.entries = entries; this.variants = variants; this.catalog = catalog;
        this.generator = generator; this.contexts = contexts;
    }

    @Override
    @Transactional(readOnly = true)
    public ExaminationOrderSearchResult search(Long organizationId, LocalDate businessDate, String query) {
        if (organizationId == null || businessDate == null) {
            throw badRequest("CLINICAL_CATALOG_CONTEXT_REQUIRED", "检索可开立目录必须明确机构和业务日期");
        }
        String normalized = generator.normalizeQuery(query).replaceAll("\\s+", "");
        if (normalized.length() < 2 || normalized.length() > 128) return new ExaminationOrderSearchResult(List.of(), List.of());
        Long tenantId = contexts.requireCurrent().tenantId();
        String prefix = normalized.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        // 首期仅中文与拼音前缀匹配，不走相似度全量扫描或无关键词目录回退。
        List<Long> ids = entries.findOrderableVariantIds(tenantId, organizationId, businessDate,
                normalized, prefix, PageRequest.of(0, RESULT_LIMIT));
        if (ids.isEmpty()) return new ExaminationOrderSearchResult(List.of(), List.of());
        var byId = variants.findByTenantIdAndIdIn(tenantId, ids).stream()
                .collect(Collectors.toMap(value -> value.id(), Function.identity()));
        var serviceIds = byId.values().stream().map(value -> value.catalogItemId()).distinct().toList();
        // 批量使用已有可开立目录过滤与视图装配，避免每个部位再次取价/取项目。
        var services = catalog.findOrderableServicesByIds(serviceIds, organizationId, businessDate).stream()
                .collect(Collectors.toMap(value -> value.id(), Function.identity()));
        var candidates = ids.stream().filter(byId::containsKey).map(byId::get)
                .filter(value -> services.containsKey(value.catalogItemId()))
                .map(value -> new ExaminationOrderCandidate(value.catalogItemId(),
                        new ExaminationSite(value.id(), value.code(), value.name()))).toList();
        return new ExaminationOrderSearchResult(serviceIds.stream().filter(services::containsKey).map(services::get).toList(), candidates);
    }
}
