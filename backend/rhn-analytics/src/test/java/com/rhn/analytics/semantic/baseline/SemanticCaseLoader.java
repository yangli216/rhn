package com.rhn.analytics.semantic.baseline;

import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Stream;

public final class SemanticCaseLoader {
    private static final String RESOURCE_DIR = "semantic-cases";
    private static final List<String> CASE_FILES = List.of(
        "outpatient-volume.yaml",
        "patient-count.yaml",
        "drug-and-charge.yaml",
        "order.yaml",
        "diagnosis.yaml",
        "trend-and-ranking.yaml",
        "ambiguity.yaml",
        "unsupported.yaml"
    );

    private SemanticCaseLoader() {}

    public static List<SemanticCase> loadAllCases() {
        List<SemanticCase> allCases = new ArrayList<>();
        Yaml yaml = new Yaml();

        for (String file : CASE_FILES) {
            String path = RESOURCE_DIR + "/" + file;
            try (InputStream in = SemanticCaseLoader.class.getClassLoader().getResourceAsStream(path)) {
                if (in == null) {
                    throw new IllegalStateException("Semantic case resource not found: " + path);
                }
                Iterable<Object> documents = yaml.loadAll(in);
                for (Object doc : documents) {
                    if (doc instanceof List<?> list) {
                        for (Object item : list) {
                            if (item instanceof Map<?, ?> map) {
                                allCases.add(parseCase(map));
                            }
                        }
                    } else if (doc instanceof Map<?, ?> map) {
                        allCases.add(parseCase(map));
                    }
                }
            } catch (Exception e) {
                throw new RuntimeException("Failed to load semantic cases from: " + path, e);
            }
        }
        return List.copyOf(allCases);
    }

    @SuppressWarnings("unchecked")
    private static SemanticCase parseCase(Map<?, ?> raw) {
        String id = Objects.toString(raw.get("id"), null);
        String category = Objects.toString(raw.get("category"), null);
        String question = Objects.toString(raw.get("question"), null);
        String description = Objects.toString(raw.get("description"), null);

        Map<?, ?> expectedMap = (Map<?, ?>) raw.get("expected");
        if (expectedMap == null) {
            throw new IllegalArgumentException("Missing expected in case: " + id);
        }

        SemanticCase.Status status = SemanticCase.Status.valueOf(Objects.toString(expectedMap.get("status")));
        String intent = Objects.toString(expectedMap.get("intent"), null);
        List<String> metrics = parseStringList(expectedMap.get("metrics"));
        List<String> dimensions = parseStringList(expectedMap.get("dimensions"));
        String scope = Objects.toString(expectedMap.get("scope"), null);

        SemanticCase.Period period = null;
        if (expectedMap.get("period") instanceof Map<?, ?> pMap) {
            period = new SemanticCase.Period(
                Objects.toString(pMap.get("type"), null),
                Objects.toString(pMap.get("startDate"), null),
                Objects.toString(pMap.get("endDate"), null)
            );
        }

        SemanticCase.Sort sort = null;
        if (expectedMap.get("sort") instanceof Map<?, ?> sMap) {
            sort = new SemanticCase.Sort(
                Objects.toString(sMap.get("metric"), null),
                Objects.toString(sMap.get("direction"), null)
            );
        }

        List<SemanticCase.Filter> filters = new ArrayList<>();
        if (expectedMap.get("filters") instanceof List<?> fList) {
            for (Object f : fList) {
                if (f instanceof Map<?, ?> fMap) {
                    filters.add(new SemanticCase.Filter(
                        Objects.toString(fMap.get("dimension"), null),
                        Objects.toString(fMap.get("operator"), null),
                        Objects.toString(fMap.get("value"), null)
                    ));
                }
            }
        }

        String clarificationCode = Objects.toString(expectedMap.get("clarificationCode"), null);
        String clarificationMessage = Objects.toString(expectedMap.get("clarificationMessage"), null);

        List<SemanticCase.CandidateOption> candidateOptions = new ArrayList<>();
        if (expectedMap.get("candidateOptions") instanceof List<?> optList) {
            for (Object opt : optList) {
                if (opt instanceof Map<?, ?> optMap) {
                    candidateOptions.add(new SemanticCase.CandidateOption(
                        Objects.toString(optMap.get("code"), null),
                        Objects.toString(optMap.get("label"), null)
                    ));
                }
            }
        }

        String unsupportedReason = Objects.toString(expectedMap.get("unsupportedReason"), null);
        String missingCapability = Objects.toString(expectedMap.get("missingCapability"), null);

        SemanticCase.Expected expected = new SemanticCase.Expected(
            status,
            intent,
            metrics,
            dimensions,
            period,
            scope,
            sort,
            filters,
            clarificationCode,
            clarificationMessage,
            candidateOptions,
            unsupportedReason,
            missingCapability
        );

        return new SemanticCase(id, category, question, description, expected);
    }

    private static List<String> parseStringList(Object obj) {
        if (obj instanceof List<?> list) {
            return list.stream().map(Object::toString).toList();
        }
        return List.of();
    }
}
