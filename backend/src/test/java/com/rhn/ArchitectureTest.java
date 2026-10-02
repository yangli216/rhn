package com.rhn;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.rhn.platform.dictionary.translation.DictionaryBindingRegistry;
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
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.lang.reflect.Field;
import java.lang.reflect.GenericArrayType;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.lang.reflect.TypeVariable;
import java.lang.reflect.WildcardType;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;
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

    private static final String DICTIONARY_PROPERTY_PREFIX = "sd";
    private static final String DICTIONARY_TEXT_SUFFIX = "Text";
    private static final String APPLICATION_PACKAGE = "com.rhn.";

    /** 复用生产装配逻辑，确保"是否已识别"的判定与运行时完全一致。 */
    private static final DictionaryBindingRegistry DICTIONARY_BINDINGS = new DictionaryBindingRegistry();

    /**
     * 非 {@code sd} 前缀、但语义明确属于字典的响应属性名种子。用于覆盖在别处以不同拼写绑定
     * （如从业人员性别是 {@code sdPractGender}）而无法被词汇表命中的已知概念。
     */
    private static final Set<String> DICTIONARY_CANDIDATE_NAMES =
            Set.of("gender", "displayStatus", "bedStatus", "workStatus");

    /**
     * 已甄别：确认不是字典字段，无需后端翻译。键为 {@code 外层类型.嵌套类型#属性名}。
     *
     * <ul>
     *   <li>{@code InsuranceResultDirectory.PersonInfoView#gender}：医保接口口径的 {@code 1/2} 编码，
     *       与居民性别 {@code MALE/FEMALE/UNKNOWN} 值域不同，不能共用居民性别字典。</li>
     *   <li>{@code StandardMedicationCatalogContracts.MedicationRecord#relationType}：值为
     *       {@code CANONICAL/HISTORICAL} 的领域枚举，不是平台字典项。</li>
     * </ul>
     */
    private static final Set<String> NOT_DICTIONARY_FIELDS = Set.of(
            "InsuranceResultDirectory.PersonInfoView#gender",
            "StandardMedicationCatalogContracts.MedicationRecord#relationType");

    /**
     * 哨兵：凡是会被序列化外发的响应类型，其字符串属性若疑似字典编码却未被识别，则前端只能本地硬编码映射。
     * 这里把这类字段在 CI 期暴露出来，而不是等到线上少一个中文。
     */
    @ArchTest
    static void response_dictionary_fields_are_recognized_or_explicitly_tracked(JavaClasses classes) {
        Set<Class<?>> responseTypes = serializedResponseTypes(classes);
        Set<String> vocabulary = dictionaryVocabulary(responseTypes);
        Set<String> unrecognized = new TreeSet<>();
        for (Class<?> type : responseTypes) {
            for (SerializedProperty property : serializedProperties(type)) {
                if (property.type() != String.class) continue;
                if (isDictionaryBound(type, property.name())) continue;
                String location = dictionaryLocation(type, property.name());
                if (!isDictionaryCandidate(property.name(), vocabulary)) continue;
                if (NOT_DICTIONARY_FIELDS.contains(location)) continue;
                unrecognized.add(location);
            }
        }
        if (!unrecognized.isEmpty()) {
            throw new AssertionError("响应字段疑似字典编码但未被识别，前端只能本地硬编码映射。"
                    + "请补 @DictionaryBinding、改用 sd 命名，或确认无需翻译后登记到 NOT_DICTIONARY_FIELDS：" + unrecognized);
        }
    }

    /** 从 {@code @RestController} 返回值出发，按字段可达闭包收集真正会被序列化外发的应用类型。 */
    private static Set<Class<?>> serializedResponseTypes(JavaClasses classes) {
        List<JavaClass> controllers = new ArrayList<>();
        for (JavaClass candidate : classes) {
            if (candidate.isMetaAnnotatedWith(RestController.class)) controllers.add(candidate);
        }
        controllers.sort(Comparator.comparing(JavaClass::getName));
        Set<Class<?>> responseTypes = new LinkedHashSet<>();
        Deque<Class<?>> pending = new ArrayDeque<>();
        for (JavaClass controller : controllers) {
            // 本项目的处理器方法多为包级可见，getMethods() 会漏掉，必须沿继承链取声明方法。
            for (Class<?> type = controller.reflect(); type != null && type != Object.class;
                    type = type.getSuperclass()) {
                for (Method method : type.getDeclaredMethods()) {
                    if (AnnotatedElementUtils.hasAnnotation(method, RequestMapping.class)) {
                        collectResponseType(method.getGenericReturnType(), responseTypes, pending);
                    }
                }
            }
        }
        while (!pending.isEmpty()) {
            Class<?> current = pending.poll();
            for (Class<?> type = current; type != null && type != Object.class && type != Record.class
                    && type != Enum.class; type = type.getSuperclass()) {
                for (Field field : type.getDeclaredFields()) {
                    if (Modifier.isStatic(field.getModifiers())) continue;
                    collectResponseType(field.getGenericType(), responseTypes, pending);
                }
            }
        }
        return responseTypes;
    }

    private static void collectResponseType(Type type, Set<Class<?>> responseTypes, Deque<Class<?>> pending) {
        if (type instanceof ParameterizedType parameterized) {
            collectResponseType(parameterized.getRawType(), responseTypes, pending);
            for (Type argument : parameterized.getActualTypeArguments()) {
                collectResponseType(argument, responseTypes, pending);
            }
            return;
        }
        if (type instanceof GenericArrayType array) {
            collectResponseType(array.getGenericComponentType(), responseTypes, pending);
            return;
        }
        if (type instanceof WildcardType wildcard) {
            for (Type bound : wildcard.getUpperBounds()) collectResponseType(bound, responseTypes, pending);
            return;
        }
        if (type instanceof TypeVariable<?> variable) {
            for (Type bound : variable.getBounds()) collectResponseType(bound, responseTypes, pending);
            return;
        }
        if (type instanceof Class<?> clazz) {
            if (clazz.isArray()) {
                collectResponseType(clazz.getComponentType(), responseTypes, pending);
                return;
            }
            if (isApplicationContractType(clazz) && responseTypes.add(clazz)) pending.add(clazz);
        }
    }

    /** 只跟踪应用内的契约类型：域层实体与仓储基础设施不属于对外契约，跳过以免污染判定。 */
    private static boolean isApplicationContractType(Class<?> type) {
        String name = type.getName();
        return name.startsWith(APPLICATION_PACKAGE)
                && !name.contains(".domain.")
                && !name.contains(".infrastructure.");
    }

    /** 从已识别属性（{@code sd} 约定 或 {@code @DictionaryBinding}）反推字典语义词汇表。 */
    private static Set<String> dictionaryVocabulary(Set<Class<?>> responseTypes) {
        Set<String> vocabulary = new TreeSet<>();
        for (Class<?> type : responseTypes) {
            for (SerializedProperty property : serializedProperties(type)) {
                if (isDictionaryBound(type, property.name())) {
                    String semanticName = dictionarySemanticName(property.name());
                    // 只收多词语义名（驼峰中段有大写）；status/use 这类单词名歧义过大，不参与自动候选。
                    if (semanticName.chars().skip(1).anyMatch(Character::isUpperCase)) vocabulary.add(semanticName);
                }
            }
        }
        return vocabulary;
    }

    private static boolean isDictionaryCandidate(String property, Set<String> vocabulary) {
        return DICTIONARY_CANDIDATE_NAMES.contains(property) || vocabulary.contains(property);
    }

    /** 与运行时一致：属性是否已被字典翻译识别（约定命名或注解，含 {@code @JsonProperty} 改名）。 */
    private static boolean isDictionaryBound(Class<?> type, String property) {
        return DICTIONARY_BINDINGS.textPropertiesFor(type).containsKey(property + DICTIONARY_TEXT_SUFFIX);
    }

    /** 定位键带上外层类型，避免同名嵌套 record（如两个 MedicationSnapshot）互相误抑制。 */
    private static String dictionaryLocation(Class<?> type, String property) {
        StringBuilder name = new StringBuilder(type.getSimpleName());
        for (Class<?> enclosing = type.getEnclosingClass(); enclosing != null;
                enclosing = enclosing.getEnclosingClass()) {
            name.insert(0, enclosing.getSimpleName() + ".");
        }
        return name + "#" + property;
    }

    private static String dictionarySemanticName(String property) {
        if (property.startsWith(DICTIONARY_PROPERTY_PREFIX)
                && property.length() > DICTIONARY_PROPERTY_PREFIX.length()
                && Character.isUpperCase(property.charAt(DICTIONARY_PROPERTY_PREFIX.length()))) {
            String stripped = property.substring(DICTIONARY_PROPERTY_PREFIX.length());
            return Character.toLowerCase(stripped.charAt(0)) + stripped.substring(1);
        }
        return property;
    }

    /**
     * 与 {@code DictionaryBindingRegistry} 的序列化视角对齐：枚举对外 JSON 属性名与声明类型。
     * record 走组件；普通类型走可读属性方法。
     */
    private static List<SerializedProperty> serializedProperties(Class<?> type) {
        List<SerializedProperty> properties = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (type.isRecord()) {
            for (RecordComponent component : type.getRecordComponents()) {
                Method accessor = component.getAccessor();
                String name = jsonName(component.getName(), component.getAnnotation(JsonProperty.class),
                        accessor.getAnnotation(JsonProperty.class));
                if (seen.add(name)) properties.add(new SerializedProperty(name, component.getType()));
            }
            return properties;
        }
        Arrays.stream(type.getMethods())
                .filter(ArchitectureTest::isReadableProperty)
                .sorted(Comparator.comparing(Method::getName))
                .forEach(accessor -> {
                    String name = jsonName(getterPropertyName(accessor), accessor.getAnnotation(JsonProperty.class));
                    if (seen.add(name)) properties.add(new SerializedProperty(name, accessor.getReturnType()));
                });
        return properties;
    }

    private static boolean isReadableProperty(Method method) {
        if (!Modifier.isPublic(method.getModifiers()) || method.getParameterCount() != 0
                || method.getReturnType() == Void.TYPE || method.getDeclaringClass() == Object.class) {
            return false;
        }
        return (method.getName().startsWith("get") && method.getName().length() > 3)
                || (method.getName().startsWith("is") && method.getName().length() > 2
                    && (method.getReturnType() == boolean.class || method.getReturnType() == Boolean.class));
    }

    private static String getterPropertyName(Method accessor) {
        String prefix = accessor.getName().startsWith("is") ? "is" : "get";
        String value = accessor.getName().substring(prefix.length());
        if (value.length() == 1) return value.toLowerCase(Locale.ROOT);
        return Character.toLowerCase(value.charAt(0)) + value.substring(1);
    }

    private static String jsonName(String fallback, JsonProperty... annotations) {
        for (JsonProperty annotation : annotations) {
            if (annotation != null && !annotation.value().isBlank()
                    && !JsonProperty.USE_DEFAULT_NAME.equals(annotation.value())) {
                return annotation.value();
            }
        }
        return fallback;
    }

    private record SerializedProperty(String name, Class<?> type) {
    }

}
