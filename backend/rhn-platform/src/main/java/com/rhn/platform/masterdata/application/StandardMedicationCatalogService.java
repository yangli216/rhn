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
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Immutable, supplied-source reference data; not a prescribing or medication safety API. */
@Service
public class StandardMedicationCatalogService {
    private final ObjectNode catalog;
    private final java.util.Set<String> formNames = new java.util.HashSet<>();
    private final List<JsonNode> entries = new ArrayList<>();
    private final Map<String, List<JsonNode>> specifications = new HashMap<>();
    private final Map<String, JsonNode> specificationsById = new HashMap<>();
    private final Map<String, List<JsonNode>> issues = new HashMap<>();
    private final Map<String, java.util.Set<String>> entriesByClue = new HashMap<>();
    private final Map<String, java.util.Set<String>> entriesByLegacyCode = new HashMap<>();

    public StandardMedicationCatalogService(JsonCodec jsonCodec) throws IOException {
        try (var input = new ClassPathResource("medication-standard-catalog.json").getInputStream()) {
            catalog = (ObjectNode) jsonCodec.readTree(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
        catalog.path("specifications").forEach(node -> specifications
                .computeIfAbsent(node.path("entryId").asString(), ignored -> new ArrayList<>()).add(node));
        catalog.path("specifications").forEach(node -> specificationsById.put(node.path("id").asString(), node));
        catalog.path("specifications").forEach(node -> formNames.add(normalized(node.path("doseFormName").asString(""))));
        catalog.path("issues").forEach(node -> issues
                .computeIfAbsent(node.path("entryId").asString(), ignored -> new ArrayList<>()).add(node));
        catalog.path("specifications").forEach(spec -> specificationIdentityIssues(spec).forEach(reason -> {
            var issue = catalog.objectNode();
            issue.put("entryId", spec.path("entryId").asString()); issue.put("specificationId", spec.path("id").asString());
            issue.put("reason", reason); issue.put("sourceText", spec.path("sourceBlock").asString());
            issues.computeIfAbsent(spec.path("entryId").asString(), ignored -> new ArrayList<>()).add(issue);
        }));
        catalog.path("entries").forEach(node -> {
            ObjectNode entry = ((ObjectNode) node).deepCopy();
            String id = entry.path("id").asString();
            entry.put("specificationCount", specifications.getOrDefault(id, List.of()).size());
            entry.put("issueCount", issues.getOrDefault(id, List.of()).size());
            entries.add(entry);
            entriesByLegacyCode.computeIfAbsent(entry.path("legacyCode").asString(""), ignored -> new java.util.LinkedHashSet<>()).add(id);
            for (String field : List.of("name", "innName")) {
                String clue = normalized(entry.path(field).asString(""));
                if (!clue.isBlank()) entriesByClue.computeIfAbsent(clue, ignored -> new java.util.LinkedHashSet<>()).add(id);
            }
        });
    }

    public JsonNode snapshot() { return catalog.deepCopy(); }

    public JsonNode summary() {
        ObjectNode value = catalog.objectNode();
        for (String key : List.of("schemaVersion", "catalogId", "catalogVersion", "source", "scopeNote", "statistics", "contentHash")) {
            value.set(key, catalog.path(key).deepCopy());
        }
        ((ObjectNode) value.path("statistics")).put("issues", issues.values().stream().mapToInt(List::size).sum());
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
        specifications.getOrDefault(id, List.of()).forEach(node -> {
            var specification = (ObjectNode) node.deepCopy();
            var identityIssues = specification.putArray("identityIssues");
            specificationIdentityIssues(node).forEach(identityIssues::add);
            specs.add(specification);
        });
        var pending = result.putArray("issues");
        issues.getOrDefault(id, List.of()).forEach(node -> pending.add(node.deepCopy()));
        result.set("source", catalog.path("source").deepCopy());
        return result;
    }

    public JsonNode specification(String id) {
        var specification = specificationsById.get(id);
        if (specification == null) throw notFound("STANDARD_SPEC_NOT_FOUND", "未找到标准药品规格");
        return specification.deepCopy();
    }

    /** Exact local identity clues only. Never use an arbitrary top-N text search as binding evidence. */
    public List<JsonNode> identityCandidates(String code, String name, String alias) {
        var ids = new java.util.LinkedHashSet<String>();
        // Traverse full legacy-code segments only; e.g. W001 must never match W0010.
        String prefix = code == null ? "" : code;
        while (!prefix.isBlank()) {
            ids.addAll(entriesByLegacyCode.getOrDefault(prefix, java.util.Set.of()));
            int dash = prefix.lastIndexOf('-');
            if (dash < 0) break;
            prefix = prefix.substring(0, dash);
        }
        ids.addAll(entriesByClue.getOrDefault(normalized(name), java.util.Set.of()));
        // Explicit semicolon-separated aliases remain exact clues. Never split a compound name on '/' or '、'.
        for (String clue : Objects.toString(alias, "").split("[;；\\n]"))
            ids.addAll(entriesByClue.getOrDefault(normalized(clue), java.util.Set.of()));
        var byCode = specificationsById.get(code);
        if (byCode != null) ids.add(byCode.path("entryId").asString());
        return ids.stream().flatMap(id -> specifications.getOrDefault(id, List.of()).stream()).map(JsonNode::deepCopy).toList();
    }

    /** Preserve source salt distinctions; a generic name alone cannot resolve colliding specifications. */
    public List<String> qualifierIdentityIssues(String medicationName, JsonNode specification) {
        var siblings = specifications.getOrDefault(specification.path("entryId").asString(), List.of());
        var qualifiers = siblings.stream().map(s -> s.path("substanceQualifier").asString(""))
                .filter(q -> !q.isBlank()).distinct().toList();
        if (qualifiers.size() < 2) return List.of();
        // This guard resolves salt collisions, not arbitrary chemical-name or ester equivalence.
        boolean collidingFamily = siblings.stream().anyMatch(a -> siblings.stream().anyMatch(b ->
                a.path("doseForm").asString().equals(b.path("doseForm").asString())
                && normalized(a.path("specification").asString()).equals(normalized(b.path("specification").asString()))
                && !a.path("substanceQualifier").asString("").equals(b.path("substanceQualifier").asString(""))));
        if (!collidingFamily) return List.of();
        String target = specification.path("substanceQualifier").asString("");
        String name = normalized(medicationName);
        var named = qualifiers.stream().filter(q -> name.contains(normalized(q))
                || q.endsWith("盐") && name.contains(normalized(q.substring(0, q.length() - 1))))
                .toList();
        if (!named.isEmpty()) return named.size() == 1 && named.contains(target) ? List.of()
                : List.of("STANDARD_REFERENCE_QUALIFIER_MISMATCH");
        boolean ambiguous = siblings.stream().anyMatch(s ->
                s.path("doseForm").asString().equals(specification.path("doseForm").asString())
                && normalized(s.path("specification").asString()).equals(normalized(specification.path("specification").asString()))
                && !s.path("substanceQualifier").asString("").equals(target));
        return ambiguous ? List.of("STANDARD_REFERENCE_QUALIFIER_MISSING") : List.of();
    }

    /** Reject incomplete source fragments as concrete medication identities, even when a legacy import agrees. */
    public List<String> specificationIdentityIssues(JsonNode specification) {
        String text = normalized(specification.path("specification").asString(""));
        boolean formOnly = formNames.contains(text);
        if (text.isBlank() || formOnly || text.matches("[0-9]+(?:\\.[0-9]+)?:[0-9]+(?:\\.[0-9]+)?"))
            return List.of("STANDARD_SPECIFICATION_INCOMPLETE");
        String block = specification.path("sourceBlock").asString("");
        int separator = block.indexOf(':');
        String body = separator < 0 ? block : block.substring(separator + 1);
        String topLevel = outsideParentheses(body);
        var nextForm = java.util.regex.Pattern.compile("(?:片剂|胶囊(?:剂)?|颗粒剂|软膏剂|乳膏剂|栓剂|注射液|注射用无菌粉末|混悬液|合剂|糖浆剂|丸剂|气雾剂|滴眼剂|滴鼻剂|散剂|酊剂|喷雾剂):")
                .matcher(topLevel);
        if (nextForm.find()) {
            // Only complete alternatives before the next form belong to this header. Do not
            // quarantine a valid first specification merely because a later paragraph was joined.
            String prefix = body.substring(0, nextForm.start());
            if (!containsCompleteAlternative(prefix, text)) return List.of("STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW");
            body = prefix;
            topLevel = outsideParentheses(body);
        }
        if (topLevel.contains("相当于") && topLevel.contains("含") && !normalized(body).equals(text))
            return List.of("STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW");
        return List.of();
    }
    private String outsideParentheses(String text) {
        var result = new StringBuilder(); int depth = 0;
        for (char character : text.toCharArray()) {
            if (character == '(' || character == '（') { depth++; result.append(' '); }
            else if (character == ')' || character == '）') { depth = Math.max(0, depth - 1); result.append(' '); }
            else result.append(depth == 0 ? character : ' ');
        }
        return result.toString();
    }
    private boolean containsCompleteAlternative(String body, String expected) {
        String visible = outsideParentheses(body); int start = 0;
        for (int i = 0; i <= visible.length(); i++) {
            if (i == visible.length() || "、,，".indexOf(visible.charAt(i)) >= 0) {
                if (normalized(body.substring(start, i)).equals(expected)) return true;
                start = i + 1;
            }
        }
        return false;
    }

    private String normalized(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").replace("（", "(").replace("）", ")").toLowerCase(Locale.ROOT);
    }

    private String searchable(JsonNode entry) {
        return (entry.path("name").asString() + " " + entry.path("innName").asString() + " "
                + entry.path("pinyinCode").asString() + " " + entry.path("legacyCode").asString() + " "
                + entry.path("id").asString() + " " + entry.path("sourceSpecification").asString()
                + " " + entry.path("categories")).toLowerCase(Locale.ROOT);
    }
}
