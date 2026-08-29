package com.rhn;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import java.util.Set;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.rhn", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {
    private static final Set<String> BUSINESS_MODULES = Set.of(
            "billing", "diagnostics", "healthcore", "healthplanning", "outpatient", "pharmacy");

    @ArchTest
    static final ArchRule persistent_model_does_not_reintroduce_uuid_identifiers = noClasses()
            .should().dependOnClassesThat().areAssignableTo(UUID.class);

    @ArchTest
    static final ArchRule business_modules_are_free_of_cycles = slices()
            .matching("com.rhn.(billing|diagnostics|healthcore|healthplanning|outpatient|pharmacy|platform)..")
            .should().beFreeOfCycles();

    @ArchTest
    static final ArchRule business_modules_depend_only_on_other_business_modules_public_api = classes()
            .that().resideInAnyPackage(
                    "com.rhn.billing..", "com.rhn.diagnostics..", "com.rhn.healthcore..",
                    "com.rhn.healthplanning..", "com.rhn.outpatient..", "com.rhn.pharmacy..")
            .should(new ArchCondition<>("depend on other business modules only through their api packages") {
                @Override
                public void check(JavaClass source, ConditionEvents events) {
                    String sourceModule = businessModule(source.getPackageName());
                    source.getDirectDependenciesFromSelf().forEach(dependency -> {
                        String targetPackage = dependency.getTargetClass().getPackageName();
                        String targetModule = businessModule(targetPackage);
                        if (targetModule != null && !targetModule.equals(sourceModule)
                                && !targetPackage.startsWith("com.rhn." + targetModule + ".api")) {
                            events.add(SimpleConditionEvent.violated(source,
                                    source.getName() + " depends on internal package " + targetPackage));
                        }
                    });
                }
            });

    @ArchTest
    static final ArchRule health_core_does_not_depend_on_outpatient = noClasses()
            .that().resideInAPackage("com.rhn.healthcore..")
            .should().dependOnClassesThat().resideInAPackage("com.rhn.outpatient..");

    @ArchTest
    static final ArchRule outpatient_uses_only_health_core_public_contract = noClasses()
            .that().resideInAPackage("com.rhn.outpatient..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.healthcore.mpi..", "com.rhn.healthcore.timeline..",
                    "com.rhn.healthcore.clinicaldocument..");

    @ArchTest
    static final ArchRule security_context_is_hidden_behind_execution_context = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.security..")
            .should().dependOnClassesThat().areAssignableTo(SecurityContextHolder.class);

    @ArchTest
    static final ArchRule json_mapper_is_hidden_behind_json_codec_or_web_adapter = noClasses()
            .that().resideOutsideOfPackage("com.rhn.shared.json..")
            .should().dependOnClassesThat().areAssignableTo(ObjectMapper.class);

    @ArchTest
    static final ArchRule business_modules_use_only_cryptography_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.cryptography..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.cryptography.application..",
                    "com.rhn.platform.cryptography.domain..",
                    "com.rhn.platform.cryptography.infrastructure..",
                    "com.rhn.platform.cryptography.spi..");

    @ArchTest
    static final ArchRule business_modules_use_only_configuration_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.configuration..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.configuration.application..",
                    "com.rhn.platform.configuration.domain..",
                    "com.rhn.platform.configuration.infrastructure..",
                    "com.rhn.platform.configuration.web..");

    @ArchTest
    static final ArchRule business_modules_use_only_dictionary_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.dictionary..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.dictionary.application..",
                    "com.rhn.platform.dictionary.domain..",
                    "com.rhn.platform.dictionary.infrastructure..",
                    "com.rhn.platform.dictionary.web..");

    @ArchTest
    static final ArchRule business_modules_use_only_master_data_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.masterdata..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.masterdata.application..",
                    "com.rhn.platform.masterdata.domain..",
                    "com.rhn.platform.masterdata.infrastructure..",
                    "com.rhn.platform.masterdata.web..");

    @ArchTest
    static final ArchRule modules_use_only_organization_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.organization..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.organization.application..",
                    "com.rhn.platform.organization.domain..",
                    "com.rhn.platform.organization.infrastructure..",
                    "com.rhn.platform.organization.web..");

    @ArchTest
    static final ArchRule modules_use_only_terminology_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.terminology..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.terminology.application..",
                    "com.rhn.platform.terminology.domain..",
                    "com.rhn.platform.terminology.infrastructure..",
                    "com.rhn.platform.terminology.web..");

    @ArchTest
    static final ArchRule modules_use_only_eventing_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.eventing..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.eventing.application..",
                    "com.rhn.platform.eventing.domain..",
                    "com.rhn.platform.eventing.infrastructure..");

    @ArchTest
    static final ArchRule modules_use_only_work_management_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.workmanagement..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.workmanagement.application..",
                    "com.rhn.workmanagement.notification..",
                    "com.rhn.workmanagement.task..",
                    "com.rhn.workmanagement.web..");

    @ArchTest
    static final ArchRule business_modules_use_only_printing_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.printing..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.printing.application..",
                    "com.rhn.platform.printing.domain..",
                    "com.rhn.platform.printing.infrastructure..",
                    "com.rhn.platform.printing.web..");

    @ArchTest
    static final ArchRule business_modules_use_only_integration_public_contract = noClasses()
            .that().resideOutsideOfPackage("com.rhn.platform.integration..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.platform.integration.application..",
                    "com.rhn.platform.integration.domain..",
                    "com.rhn.platform.integration.infrastructure..");

    private static String businessModule(String packageName) {
        String prefix = "com.rhn.";
        if (!packageName.startsWith(prefix)) return null;
        String remainder = packageName.substring(prefix.length());
        int separator = remainder.indexOf('.');
        String module = separator < 0 ? remainder : remainder.substring(0, separator);
        return BUSINESS_MODULES.contains(module) ? module : null;
    }
}
