package com.rhn;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.rhn", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule persistent_model_does_not_reintroduce_uuid_identifiers = noClasses()
            .should().dependOnClassesThat().areAssignableTo(UUID.class);

    @ArchTest
    static final ArchRule business_modules_are_free_of_cycles = slices()
            .matching("com.rhn.(diagnostics|healthcore|outpatient|pharmacy|platform)..")
            .should().beFreeOfCycles();

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
}
