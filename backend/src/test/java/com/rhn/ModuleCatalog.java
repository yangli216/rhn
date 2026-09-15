package com.rhn;

import com.tngtech.archunit.core.domain.JavaClass;
import jakarta.persistence.Entity;
import org.springframework.data.repository.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Reads the versioned module registry used by the architecture gates. */
final class ModuleCatalog {
    static final ModuleCatalog INSTANCE = read();
    final Map<String, Module> modules;
    final String applicationClass;

    private ModuleCatalog(Map<String, Module> modules, String applicationClass) {
        this.modules = Map.copyOf(modules);
        this.applicationClass = applicationClass;
    }

    Module moduleOf(String packageName) {
        if (!packageName.startsWith("com.rhn.")) return null;
        return modules.get(packageName.substring("com.rhn.".length()).split("\\.", 2)[0]);
    }

    boolean isPublicContract(Module module, String className, String packageName) {
        if (module.publicTypes().stream().anyMatch(type -> className.equals(type) || className.startsWith(type + "$"))) {
            return true;
        }
        if (module.publicPackages().stream().anyMatch(prefix -> within(packageName, prefix))) return true;
        String root = "com.rhn." + module.name();
        return within(packageName, root) && java.util.Arrays.asList(packageName.substring(root.length()).split("\\.", -1)).contains("api");
    }

    boolean isPersistent(JavaClass type) {
        return type.isAnnotatedWith(Entity.class) || type.isAssignableTo(Repository.class);
    }

    static boolean within(String packageName, String prefix) {
        return packageName.equals(prefix) || packageName.startsWith(prefix + ".");
    }

    private static ModuleCatalog read() {
        try (var input = ModuleCatalog.class.getResourceAsStream("/architecture/module-catalog.json")) {
            if (input == null) throw new IllegalStateException("Missing module catalog");
            JsonNode document = new ObjectMapper().readTree(input);
            if (document.path("version").asInt() != 2) throw new IllegalStateException("Unsupported module catalog version");
            Map<String, Module> modules = new LinkedHashMap<>();
            for (JsonNode entry : document.path("modules")) {
                Module module = new Module(entry.path("package").asString(), entry.path("artifact").asString(),
                        entry.path("owner").asString(), entry.path("status").asString(),
                        strings(entry.path("allowedDependencies")), strings(entry.path("publicTypes")),
                        strings(entry.path("publicPackages")));
                if (module.name().isBlank() || module.owner().isBlank() || !module.artifact().startsWith("rhn-")
                        || !Set.of("active", "reserved").contains(module.status())
                        || modules.putIfAbsent(module.name(), module) != null) {
                    throw new IllegalStateException("Invalid or duplicate module: " + module.name());
                }
            }
            modules.values().forEach(module -> module.allowedDependencies().forEach(target -> {
                if (!modules.containsKey(target) || target.equals(module.name())) {
                    throw new IllegalStateException("Invalid dependency: " + module.name() + " -> " + target);
                }
            }));
            return new ModuleCatalog(modules, document.path("applicationClass").asString());
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read module catalog", exception);
        }
    }

    private static Set<String> strings(JsonNode array) {
        Set<String> values = new LinkedHashSet<>();
        for (JsonNode value : array) values.add(value.asString());
        return Set.copyOf(values);
    }

    record Module(String name, String artifact, String owner, String status, Set<String> allowedDependencies,
                  Set<String> publicTypes, Set<String> publicPackages) {}
}
