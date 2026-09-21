package com.rhn;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import com.rhn.pharmacy.application.InventoryAvailabilityService;
import com.rhn.pharmacy.infrastructure.InventoryBalanceRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionLineRepository;
import com.rhn.pharmacy.application.InventoryApplicationService;
import com.rhn.pharmacy.application.DispenseApplicationService;
import org.junit.jupiter.api.Tag;
import org.springframework.security.core.context.SecurityContextHolder;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;
import java.util.Set;

import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.rhn", importOptions = ImportOption.DoNotIncludeTests.class)
@Tag("outpatient-main-flow")
class ArchitectureTest {
    private static final ModuleCatalog CATALOG = ModuleCatalog.INSTANCE;

    @ArchTest
    static final ArchRule clinical_does_not_depend_on_quality_implementation = noClasses()
            .that().resideInAnyPackage("com.rhn.outpatient..", "com.rhn.inpatient..", "com.rhn.pharmacy..")
            .should().dependOnClassesThat().resideInAPackage("com.rhn.quality..");

    @ArchTest
    static final ArchRule quality_domain_has_no_application_or_storage_dependencies = noClasses()
            .that().resideInAPackage("com.rhn.quality.medication.domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.quality.medication.application..", "com.rhn.quality.medication.infrastructure..");

    @ArchTest
    static final ArchRule analytics_layers_are_free_of_cycles = slices()
            .matching("com.rhn.analytics.(*)..")
            .should().beFreeOfCycles();

    @ArchTest
    static final ArchRule analytics_domain_has_no_adapter_dependencies = noClasses()
            .that().resideInAPackage("com.rhn.analytics.domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.analytics.application..", "com.rhn.analytics.infrastructure..", "com.rhn.analytics.web..");

    @ArchTest
    static final ArchRule analytics_web_uses_application_only = noClasses()
            .that().resideInAPackage("com.rhn.analytics.web..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "com.rhn.analytics.infrastructure..", "com.rhn.analytics.domain..");

    @ArchTest
    static final ArchRule persistent_model_does_not_reintroduce_uuid_identifiers = noClasses()
            .should().dependOnClassesThat().areAssignableTo(UUID.class);

    @ArchTest
    static final ArchRule business_modules_are_free_of_cycles = slices()
            .matching("com.rhn.(*)..")
            .should().beFreeOfCycles();

    @ArchTest
    static final ArchRule mutable_inventory_balance_repository_is_hidden_behind_availability_gateway = classes()
            .that().resideInAPackage("com.rhn.pharmacy..")
            .should(new ArchCondition<>("access mutable inventory balances only through InventoryAvailabilityService") {
                @Override
                public void check(JavaClass source, ConditionEvents events) {
                    if (source.getName().equals(InventoryAvailabilityService.class.getName())) return;
                    source.getDirectDependenciesFromSelf().stream()
                            .filter(dependency -> dependency.getTargetClass().getName()
                                    .equals(InventoryBalanceRepository.class.getName()))
                            .forEach(dependency -> events.add(SimpleConditionEvent.violated(source,
                                    source.getName() + " bypasses InventoryAvailabilityService")));
                }
            });

    @ArchTest
    static final ArchRule inventory_ledger_repositories_are_hidden_behind_ledger_service = classes()
            .that().resideInAPackage("com.rhn.pharmacy..")
            .should(new ArchCondition<>("access ledger repositories only through the ledger service") {
                @Override
                public void check(JavaClass source, ConditionEvents events) {
                    boolean postingService = source.getName().equals(InventoryApplicationService.class.getName());
                    boolean originalLineReader = source.getName().equals(DispenseApplicationService.class.getName());
                    source.getDirectDependenciesFromSelf().forEach(dependency -> {
                        String target = dependency.getTargetClass().getName();
                        boolean forbiddenTransactionAccess = target.equals(InventoryTransactionRepository.class.getName())
                                && !postingService;
                        boolean forbiddenLineAccess = target.equals(InventoryTransactionLineRepository.class.getName())
                                && !postingService && !originalLineReader;
                        if (forbiddenTransactionAccess || forbiddenLineAccess) {
                            events.add(SimpleConditionEvent.violated(source,
                                    source.getName() + " bypasses InventoryLedgerPostingService"));
                        }
                    });
                }
            });

    @ArchTest
    static final ArchRule every_production_class_belongs_to_a_registered_module = classes()
            .that().resideInAPackage("com.rhn..")
            .should(new ArchCondition<>("belong to the module catalog or be the application entry point") {
                @Override
                public void check(JavaClass source, ConditionEvents events) {
                    if (CATALOG.moduleOf(source.getPackageName()) == null
                            && !source.getName().equals(CATALOG.applicationClass)) {
                        events.add(SimpleConditionEvent.violated(source, "Unregistered module: " + source.getName()));
                    }
                }
            });

    @ArchTest
    static final ArchRule modules_follow_registered_dependency_directions_and_public_contracts = classes()
            .that().resideInAPackage("com.rhn..")
            .should(new ArchCondition<>("use only registered dependencies and public API, never foreign entities or repositories") {
                @Override
                public void check(JavaClass source, ConditionEvents events) {
                    ModuleCatalog.Module origin = CATALOG.moduleOf(source.getPackageName());
                    if (origin == null) return; // The registration rule rejects unknown packages separately.
                    source.getDirectDependenciesFromSelf().forEach(dependency -> {
                        JavaClass targetClass = dependency.getTargetClass();
                        ModuleCatalog.Module target = CATALOG.moduleOf(targetClass.getPackageName());
                        if (target == null) {
                            if (targetClass.getPackageName().startsWith("com.rhn")) {
                                events.add(SimpleConditionEvent.violated(source,
                                        source.getName() + " depends on an unregistered/app class " + targetClass.getName()));
                            }
                            return;
                        }
                        if (target.name().equals(origin.name())) return;
                        if (!origin.allowedDependencies().contains(target.name())
                                || !CATALOG.isPublicContract(target, targetClass.getName(), targetClass.getPackageName())
                                || CATALOG.isPersistent(targetClass)) {
                            events.add(SimpleConditionEvent.violated(source,
                                    source.getName() + " crosses module boundary to " + targetClass.getName()));
                        }
                    });
                }
            });

    @ArchTest
    static final ArchRule public_api_does_not_expose_persistent_models = noClasses()
            .that().resideInAPackage("..api..")
            .should().dependOnClassesThat().areAnnotatedWith(jakarta.persistence.Entity.class);

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
            .that().resideOutsideOfPackages(
                    "com.rhn.platform.masterdata..", "com.rhn.platform.search..")
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
            .that().resideOutsideOfPackages(
                    "com.rhn.platform.terminology..", "com.rhn.platform.search..")
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

}
