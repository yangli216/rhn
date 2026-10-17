package com.rhn.platform.search.infrastructure;

import com.rhn.platform.search.application.WubiCodeProvider;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Component
public class ClasspathWubiCodeProvider implements WubiCodeProvider {
    private static final String RESOURCE = "master-data-search/wubi86-single.tsv";
    private static final String VERSION = "wubi86-rime-0.7";
    private final Map<Integer, String> codes;

    public ClasspathWubiCodeProvider() {
        this.codes = Dictionary.CODES;
    }

    @Override
    public String codePointCode(int codePoint) {
        return codes.get(codePoint);
    }

    @Override
    public String version() {
        return VERSION;
    }

    /** The bundled dictionary is immutable, so every application context in one JVM shares a single load. */
    private static final class Dictionary {
        private static final Map<Integer, String> CODES = load();
    }

    private static Map<Integer, String> load() {
        ClassPathResource resource = new ClassPathResource(RESOURCE);
        if (!resource.exists()) throw new IllegalStateException("缺少五笔简码词典：" + RESOURCE);
        Map<Integer, String> result = new HashMap<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                resource.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] parts = line.split("\\t", 2);
                if (parts.length != 2 || parts[0].codePointCount(0, parts[0].length()) != 1) continue;
                result.putIfAbsent(parts[0].codePointAt(0), parts[1].trim());
            }
        } catch (IOException exception) {
            throw new IllegalStateException("五笔简码词典加载失败", exception);
        }
        if (result.isEmpty()) throw new IllegalStateException("五笔简码词典为空");
        // Map.copyOf probes tens of thousands of clustered Integer keys slowly; a read-only HashMap view loads in milliseconds.
        return Collections.unmodifiableMap(result);
    }
}
