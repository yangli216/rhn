package com.rhn.platform.masterdata.application;

import com.rhn.shared.api.PageResult;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import com.rhn.shared.json.JsonCodec;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Immutable, supplied-source reference data; not a prescribing or medication safety API. */
@Service
public class StandardMedicationCatalogService {
    private final ObjectNode catalog;
    private final List<JsonNode> entries = new ArrayList<>();
    private final Map<String, List<JsonNode>> specifications = new HashMap<>();
    private final Map<String, List<JsonNode>> issues = new HashMap<>();

    public StandardMedicationCatalogService(JsonCodec jsonCodec) throws IOException {
        try (var input = new ClassPathResource("medication-standard-catalog.json").getInputStream()) {
            catalog = (ObjectNode) jsonCodec.readTree(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        catalog.path("specifications").forEach(node -> specifications
                .computeIfAbsent(node.path("entryId").asString(), ignored -> new ArrayList<>()).add(node));
        catalog.path("issues").forEach(node -> issues
                .computeIfAbsent(node.path("entryId").asString(), ignored -> new ArrayList<>()).add(node));
        catalog.path("entries").forEach(node -> {
            ObjectNode entry = ((ObjectNode) node).deepCopy();
            String id = entry.path("id").asString();
            entry.put("specificationCount", specifications.getOrDefault(id, List.of()).size());
            entry.put("issueCount", issues.getOrDefault(id, List.of()).size());
            entries.add(entry);
        });
    }

    public JsonNode summary() {
        ObjectNode value = catalog.objectNode();
        for (String key : List.of("schemaVersion", "catalogId", "catalogVersion", "source", "scopeNote", "statistics", "contentHash")) {
            value.set(key, catalog.path(key).deepCopy());
        }
        return value;
    }

    public PageResult<JsonNode> search(String query, String medicationType, String state, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || query != null && query.length() > 200
                || medicationType != null && !List.of("", "WESTERN", "CHINESE_PATENT").contains(medicationType)
                || state != null && !List.of("", "SCOPE", "REVIEW", "STRUCTURED").contains(state)) {
            throw badRequest("STANDARD_MEDICATION_QUERY_INVALID", "目录查询条件或分页参数不正确");
        }
        String needle = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        List<JsonNode> filtered = entries.stream()
                .filter(entry -> medicationType == null || medicationType.isBlank()
                        || medicationType.equals(entry.path("medicationType").asString()))
                .filter(entry -> state == null || state.isBlank()
                        || "SCOPE".equals(state) && "SCOPE".equals(entry.path("entryType").asString())
                        || "REVIEW".equals(state) && entry.path("issueCount").asInt() > 0
                        || "STRUCTURED".equals(state) && entry.path("specificationCount").asInt() > 0)
                .filter(entry -> needle.isEmpty() || searchable(entry).contains(needle)).toList();
        int from = (int) Math.min((long) page * size, filtered.size());
        int to = Math.min(from + size, filtered.size());
        return new PageResult<>(filtered.subList(from, to).stream().map(JsonNode::deepCopy).toList(),
                filtered.size(), (filtered.size() + size - 1) / size, page, size);
    }

    public JsonNode detail(String id) {
        ObjectNode entry = (ObjectNode) entries.stream().filter(node -> id.equals(node.path("id").asString()))
                .findFirst().orElseThrow(() -> notFound("STANDARD_MEDICATION_NOT_FOUND", "未找到标准目录条目"));
        ObjectNode result = entry.deepCopy();
        var specs = result.putArray("specifications");
        specifications.getOrDefault(id, List.of()).forEach(node -> specs.add(node.deepCopy()));
        var pending = result.putArray("issues");
        issues.getOrDefault(id, List.of()).forEach(node -> pending.add(node.deepCopy()));
        result.set("source", catalog.path("source").deepCopy());
        return result;
    }

    public JsonNode specification(String id) {
        return specifications.values().stream().flatMap(List::stream)
                .filter(spec -> id.equals(spec.path("id").asString())).findFirst()
                .map(JsonNode::deepCopy).orElseThrow(() -> notFound("STANDARD_SPEC_NOT_FOUND", "未找到标准药品规格"));
    }

    private String searchable(JsonNode entry) {
        return (entry.path("name").asString() + " " + entry.path("innName").asString() + " "
                + entry.path("pinyinCode").asString() + " " + entry.path("legacyCode").asString() + " "
                + entry.path("id").asString() + " " + entry.path("sourceSpecification").asString()
                + " " + entry.path("categories")).toLowerCase(Locale.ROOT);
    }
}
