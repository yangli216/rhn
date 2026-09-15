package com.rhn;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import javax.xml.parsers.DocumentBuilderFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("outpatient-main-flow")
class ModuleCatalogTest {
    private final ModuleCatalog catalog = ModuleCatalog.INSTANCE;

    @Test
    void architectureRulesActuallyRejectUnregisteredPackagesAndForeignRepositories() throws Exception {
        var importer = new com.tngtech.archunit.core.importer.ClassFileImporter();
        var unknown = importer.importClasses(Class.forName("com.rhn.unregistered.api.UnregisteredFixture"));
        assertThat(ArchitectureTest.every_production_class_belongs_to_a_registered_module
                .evaluate(unknown).hasViolation()).isTrue();
        var repositoryAccess = importer.importClasses(
                Class.forName("com.rhn.outpatient.architecturefixtures.InternalAccessFixture"));
        var result = ArchitectureTest.modules_follow_registered_dependency_directions_and_public_contracts
                .evaluate(repositoryAccess);
        assertThat(result.hasViolation()).isTrue();
        assertThat(result.getFailureReport().toString()).contains("UserAccountRepository");
    }

    @Test
    void rejectsUnknownModulesAndApiLookalikes() {
        assertThat(catalog.moduleOf("com.rhn.unregistered.api")).isNull();
        assertThat(catalog.moduleOf("com.rhn.queueing.application").name()).isEqualTo("queueing");
        assertThat(catalog.moduleOf("com.rhn.portal.application").name()).isEqualTo("portal");
        assertThat(catalog.moduleOf("com.rhn.workmanagement.task").name()).isEqualTo("workmanagement");
        var platform = catalog.modules.get("platform");
        assertThat(catalog.isPublicContract(platform, "com.rhn.platform.realtime.api.RealtimePublisher",
                "com.rhn.platform.realtime.api")).isTrue();
        assertThat(catalog.isPublicContract(platform, "com.rhn.platform.realtime.apievil.Internal",
                "com.rhn.platform.realtime.apievil")).isFalse();
        assertThat(catalog.isPublicContract(platform, "com.rhn.platform.identityaccess.infrastructure.UserAccountRepository",
                "com.rhn.platform.identityaccess.infrastructure")).isFalse();
        assertThat(catalog.isPublicContract(platform, "com.rhn.platform.idempotency.IdempotencyServiceInternal",
                "com.rhn.platform.idempotency")).isFalse();
        assertThat(platform.allowedDependencies()).containsExactly("shared");
        assertThat(catalog.modules.get("shared").allowedDependencies()).isEmpty();
        assertThat(catalog.modules.get("healthcore").allowedDependencies()).doesNotContain("outpatient");
    }

    @Test
    void everyCatalogModuleIsBuiltAndSourcesBelongToTheirDeclaredArtifact() throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        var pom = factory.newDocumentBuilder().parse(Path.of("pom.xml").toFile());
        var nodes = pom.getElementsByTagName("module");
        Set<String> builtModules = new HashSet<>();
        for (int index = 0; index < nodes.getLength(); index++) builtModules.add(nodes.item(index).getTextContent());
        assertThat(builtModules).containsExactlyInAnyOrderElementsOf(catalog.modules.values().stream()
                .map(ModuleCatalog.Module::artifact).collect(java.util.stream.Collectors.toSet()));
        for (String artifact : builtModules) {
            Path sourceRoot = Path.of(artifact, "src/main/java/com/rhn");
            assertThat(sourceRoot).isDirectory();
            try (var files = Files.walk(sourceRoot)) {
                for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                    Path relative = sourceRoot.relativize(file);
                    if (relative.toString().equals("RhnApplication.java")) {
                        assertThat(artifact).isEqualTo("rhn-app");
                        continue;
                    }
                    var module = catalog.modules.get(relative.getName(0).toString());
                    assertThat(module).as("Registered source: %s", file).isNotNull();
                    assertThat(module.artifact()).as("Artifact owner of %s", file).isEqualTo(artifact);
                }
            }
        }
        Path legacyRoot = Path.of("src/main/java");
        if (Files.exists(legacyRoot)) {
            try (var files = Files.walk(legacyRoot)) {
                assertThat(files.filter(path -> path.toString().endsWith(".java")).toList())
                        .as("Production sources must not be left outside the Maven reactor").isEmpty();
            }
        }
    }
}
