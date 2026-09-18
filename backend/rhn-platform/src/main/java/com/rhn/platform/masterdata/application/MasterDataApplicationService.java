package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataCommands.AdoptionCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ManufacturerCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.PackageCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.PriceCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ProductCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ServiceCommand;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.api.MasterDataItemTypes;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.masterdata.api.ServiceCatalogDirectory.ServiceCatalogSnapshot;
import com.rhn.platform.masterdata.api.MasterDataViews.ManufacturerView;
import com.rhn.platform.masterdata.api.MasterDataViews.ItemTypeView;
import com.rhn.platform.masterdata.api.MasterDataViews.LaboratoryServiceView;
import com.rhn.platform.masterdata.api.MasterDataViews.LaboratorySpecimenView;
import com.rhn.platform.masterdata.api.MasterDataViews.ExaminationServiceView;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceVariantView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductEntryView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.platform.masterdata.domain.CatalogPrice;
import com.rhn.platform.masterdata.domain.ItemPackage;
import com.rhn.platform.masterdata.domain.ItemType;
import com.rhn.platform.masterdata.domain.ItemAttributeSubject;
import com.rhn.platform.masterdata.domain.LaboratoryService;
import com.rhn.platform.masterdata.domain.LaboratoryServiceSpecimen;
import com.rhn.platform.masterdata.domain.ExaminationService;
import com.rhn.platform.masterdata.domain.ServiceVariant;
import com.rhn.platform.masterdata.domain.Manufacturer;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.domain.MedicationProduct;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.CatalogPriceRepository;
import com.rhn.platform.masterdata.infrastructure.ItemPackageRepository;
import com.rhn.platform.masterdata.infrastructure.ItemTypeRepository;
import com.rhn.platform.masterdata.infrastructure.ItemAttributeSubjectRepository;
import com.rhn.platform.masterdata.infrastructure.LaboratoryServiceRepository;
import com.rhn.platform.masterdata.infrastructure.LaboratoryServiceSpecimenRepository;
import com.rhn.platform.masterdata.infrastructure.ExaminationServiceRepository;
import com.rhn.platform.masterdata.infrastructure.ExaminationAttachmentItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceVariantRepository;
import com.rhn.platform.masterdata.infrastructure.ManufacturerRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.SupplyItemRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.api.PageResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Collection;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class MasterDataApplicationService implements ServiceCatalogDirectory {
    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;
    private final ServiceCatalogItemRepository serviceRepository;
    private final SupplyItemRepository supplyRepository;
    private final MedicationRepository medicationRepository;
    private final ManufacturerRepository manufacturerRepository;
    private final MedicationProductRepository productRepository;
    private final ItemPackageRepository packageRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final ItemAttributeSubjectRepository attributeSubjectRepository;
    private final LaboratoryServiceRepository laboratoryServiceRepository;
    private final LaboratoryServiceSpecimenRepository laboratorySpecimenRepository;
    private final ExaminationServiceRepository examinationServiceRepository;
    private final ExaminationAttachmentItemRepository examinationAttachmentRepository;
    private final ServiceVariantRepository serviceVariantRepository;
    private final OrganizationCatalogItemRepository adoptionRepository;
    private final CatalogPriceRepository priceRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final ExecutionContextProvider contextProvider;
    private final OrderFrequencyDirectory orderFrequencyDirectory;
    private final MedicationRouteDirectory medicationRouteDirectory;
    private final MedicationTerminologyDirectory medicationTerminologyDirectory;
    private final MedicationSemanticsService medicationSemantics;

    public MasterDataApplicationService(ServiceCatalogItemRepository serviceRepository,
                                        SupplyItemRepository supplyRepository,
                                        MedicationRepository medicationRepository,
                                        ManufacturerRepository manufacturerRepository,
                                        MedicationProductRepository productRepository,
                                        ItemPackageRepository packageRepository,
                                        ItemTypeRepository itemTypeRepository,
                                        ItemAttributeSubjectRepository attributeSubjectRepository,
                                        LaboratoryServiceRepository laboratoryServiceRepository,
                                        LaboratoryServiceSpecimenRepository laboratorySpecimenRepository,
                                        ExaminationServiceRepository examinationServiceRepository,
                                        ExaminationAttachmentItemRepository examinationAttachmentRepository,
                                        ServiceVariantRepository serviceVariantRepository,
                                        OrganizationCatalogItemRepository adoptionRepository,
                                        CatalogPriceRepository priceRepository,
                                        DictionaryDirectory dictionaryDirectory,
                                        OrganizationDirectory organizationDirectory,
                                        ExecutionContextProvider contextProvider,
                                        OrderFrequencyDirectory orderFrequencyDirectory,
                                        MedicationRouteDirectory medicationRouteDirectory,
                                        MedicationTerminologyDirectory medicationTerminologyDirectory, MedicationSemanticsService medicationSemantics) {
        this.medicationSemantics = medicationSemantics;
        this.serviceRepository = serviceRepository;
        this.supplyRepository = supplyRepository;
        this.medicationRepository = medicationRepository;
        this.manufacturerRepository = manufacturerRepository;
        this.productRepository = productRepository;
        this.packageRepository = packageRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.attributeSubjectRepository = attributeSubjectRepository;
        this.laboratoryServiceRepository = laboratoryServiceRepository;
        this.laboratorySpecimenRepository = laboratorySpecimenRepository;
        this.examinationServiceRepository = examinationServiceRepository;
        this.examinationAttachmentRepository = examinationAttachmentRepository;
        this.serviceVariantRepository = serviceVariantRepository;
        this.adoptionRepository = adoptionRepository;
        this.priceRepository = priceRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory;
        this.contextProvider = contextProvider;
        this.orderFrequencyDirectory = orderFrequencyDirectory;
        this.medicationRouteDirectory = medicationRouteDirectory;
        this.medicationTerminologyDirectory = medicationTerminologyDirectory;
    }

    @Transactional(readOnly = true)
    public List<ItemTypeView> listItemTypes(String subjectType) {
        Long tenantId = current().tenantId();
        List<ItemType> values = blank(subjectType)
                ? itemTypeRepository.findByStatusOrderBySubjectTypeAscSortOrderAscNameAsc("ACTIVE")
                : itemTypeRepository.findBySubjectTypeAndStatusOrderBySortOrderAscNameAsc(subjectType, "ACTIVE");
        return values.stream()
                .filter(value -> value.tenantId() == null || value.tenantId().equals(tenantId))
                .map(value -> new ItemTypeView(value.id(), value.revision(), value.scopeType(), value.tenantId(),
                        value.parentId(), value.code(), value.name(), value.description(), value.subjectType(),
                        value.sortOrder(), value.status()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ServiceView> listServices(String query, String serviceType, String status, Long organizationId) {
        ExecutionContext context = current();
        List<ServiceCatalogItem> items = serviceRepository
                .findByTenantIdAndItemTypeOrderByName(context.tenantId(), "SERVICE").stream()
                .filter(value -> blank(serviceType) || serviceType.equals(value.serviceType()))
                .filter(value -> blank(status) || status.equals(value.status()))
                .limit(500).toList();
        return serviceViews(context.tenantId(), items, organizationId).stream()
                .filter(value -> matchesServiceView(query, value))
                .limit(500)
                .toList();
    }

    @Transactional(readOnly = true)
    public PageResult<ServiceView> searchServices(String query, String serviceType, String status,
                                                   Long organizationId, int page, int size) {
        ExecutionContext context = current();
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(10, Math.min(size, 100));
        Page<ServiceCatalogItem> result = serviceRepository.search(context.tenantId(), query, serviceType, status,
                PageRequest.of(normalizedPage, normalizedSize,
                        Sort.by("name").ascending().and(Sort.by("id").ascending())));
        return new PageResult<>(serviceViews(context.tenantId(), result.getContent(), organizationId),
                result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ServiceView> searchOrderableServices(String query, String serviceType, Long organizationId, LocalDate date) {
        if (!java.util.Set.of("LABORATORY", "EXAMINATION").contains(serviceType)) return List.of();
        return searchServices(query, serviceType, "ACTIVE", organizationId, 0, 100).content().stream()
                .filter(value -> value.orderable() && java.util.Set.of("OUTPATIENT", "COMMON").contains(value.sdUsageType()))
                .filter(value -> value.validFrom() == null || !value.validFrom().isAfter(date))
                .filter(value -> value.validTo() == null || !value.validTo().isBefore(date))
                .filter(value -> value.organizationAdoption() != null
                        && organizationId.equals(value.organizationAdoption().organizationId())
                        && "ACTIVE".equals(value.organizationAdoption().sdStatus())
                        && value.organizationAdoption().orderable() && value.organizationAdoption().executable()
                        && (value.organizationAdoption().validFrom() == null || !value.organizationAdoption().validFrom().isAfter(date))
                        && (value.organizationAdoption().validTo() == null || !value.organizationAdoption().validTo().isBefore(date)))
                .limit(8).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceCatalogSnapshot requireActiveService(Long tenantId, Long catalogItemId, LocalDate businessDate) {
        ServiceCatalogItem item = requireService(tenantId, catalogItemId);
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        if (!"ACTIVE".equals(item.status()) || item.validFrom().isAfter(date)
                || item.validTo() != null && item.validTo().isBefore(date)) {
            throw badRequest("SCHEDULE_SERVICE_INACTIVE", "所选诊疗项目在排班日期范围内不可用");
        }
        return new ServiceCatalogSnapshot(item.id(), item.code(), item.name(), item.unitCode(),
                item.serviceType(), item.validFrom(), item.validTo());
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceCatalogSnapshot requireSchedulableOutpatientService(Long tenantId, Long organizationId,
                                                                      Long catalogItemId, LocalDate businessDate) {
        ServiceCatalogSnapshot snapshot = requireActiveService(tenantId, catalogItemId, businessDate);
        ServiceCatalogItem item = requireService(tenantId, catalogItemId);
        if (!item.orderable()
                || !"OUTPATIENT".equals(item.usageType())
                || !"OUTPATIENT_VISIT".equals(item.serviceSubtype())
                || !"REGISTRATION".equals(item.accountingCategory())) {
            throw badRequest("SCHEDULE_SERVICE_CATEGORY_INVALID",
                    "门诊排班只能选择门诊诊查类服务，不能选择检查、检验、治疗或其他收费项目");
        }
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        OrganizationCatalogItem adoption = resolvedAdoption(tenantId, organizationId, catalogItemId, date);
        if (adoption == null) throw badRequest("SCHEDULE_SERVICE_NOT_ADOPTED",
                "所选门诊诊查服务尚未在当前机构生效");
        if (!adoption.orderable() || !adoption.executable()) {
            throw badRequest("SCHEDULE_SERVICE_NOT_AVAILABLE",
                    "所选门诊诊查服务未开放机构开立或执行权限");
        }
        return snapshot;
    }

    private OrganizationCatalogItem resolvedAdoption(Long tenantId, Long organizationId, Long catalogItemId,
                                                       LocalDate businessDate) {
        List<OrganizationCatalogItem> localHistory = adoptionRepository
                .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, organizationId, catalogItemId);
        OrganizationCatalogItem localRule = localHistory.stream()
                .filter(value -> value.overlaps(businessDate, businessDate)).findFirst().orElse(null);
        if (localRule != null) return localRule.effectiveAt(businessDate) ? localRule : null;
        Long sourceOrganizationId = organizationDirectory.catalogSourceOrganizationId(tenantId, organizationId);
        if (sourceOrganizationId == null) return null;
        return adoptionRepository.findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, sourceOrganizationId, catalogItemId).stream()
                .filter(value -> value.effectiveAt(businessDate)).findFirst().orElse(null);
    }

    @Transactional
    public ServiceView createService(ServiceCommand command, Long organizationId) {
        ExecutionContext context = current();
        validateService(command);
        if (serviceRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("SERVICE_CODE_DUPLICATE", "当前租户已存在相同诊疗项目编码");
        }
        ServiceCatalogItem item = serviceRepository.save(new ServiceCatalogItem(context.tenantId(),
                context.subjectId(), MasterDataItemTypes.forService(command.serviceType()), command.code(),
                command.name(), command.unitCode(), command.orderable(),
                command.chargeable(), command.status(), command.validFrom(), command.validTo(),
                command.serviceType(), command.serviceSubtype(), command.usageType(), command.medicalTechnology(),
                command.combinationItem(), command.singleOrder(), command.specimenType(), command.examinationType(),
                command.accountingCategory(), command.duplicateRule(), command.multiSitePrice(), command.freeSiteCount(),
                command.maxBodySiteCount(), command.mutualRecognitionCode(), command.pregnancyAlert(),
                command.attention(), command.examinationNotes()));
        synchronizeServiceTypeExtension(item, command);
        attributeSubjectRepository.save(ItemAttributeSubject.catalogItem(
                context.tenantId(), item.id(), context.subjectId()));
        return serviceViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional(readOnly = true)
    public void validateServiceForImport(ServiceCommand command) {
        ExecutionContext context = current();
        validateService(command);
        if (serviceRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("SERVICE_CODE_DUPLICATE", "当前租户已存在相同诊疗项目编码");
        }
    }

    @Transactional
    public ServiceView updateService(Long id, long expectedRevision, ServiceCommand command, Long organizationId) {
        ExecutionContext context = current();
        validateService(command);
        ServiceCatalogItem item = requireService(context.tenantId(), id);
        requireRevision(item.revision(), expectedRevision, "SERVICE_REVISION_STALE", "诊疗项目已被其他用户修改，请刷新后重试");
        if (!item.serviceType().equals(command.serviceType())) {
            throw badRequest("SERVICE_TYPE_IMMUTABLE", "诊疗项目类型创建后不允许直接修改");
        }
        item.update(expectedRevision, context.subjectId(), MasterDataItemTypes.forService(command.serviceType()),
                command.name(), command.unitCode(), command.orderable(),
                command.chargeable(), command.status(), command.validFrom(), command.validTo(), command.serviceType(),
                command.serviceSubtype(), command.usageType(), command.medicalTechnology(), command.combinationItem(),
                command.singleOrder(), command.specimenType(), command.examinationType(), command.accountingCategory(),
                command.duplicateRule(), command.multiSitePrice(), command.freeSiteCount(),
                command.maxBodySiteCount(), command.mutualRecognitionCode(), command.pregnancyAlert(),
                command.attention(), command.examinationNotes());
        synchronizeServiceTypeExtension(item, command);
        return serviceViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional
    public ServiceView changeServiceStatus(Long id, long expectedRevision, String status, Long organizationId) {
        ExecutionContext context = current();
        requireCode(MasterDataDictionaryCodes.STATUS, status);
        ServiceCatalogItem item = requireService(context.tenantId(), id);
        requireRevision(item.revision(), expectedRevision, "SERVICE_REVISION_STALE", "诊疗项目已被其他用户修改，请刷新后重试");
        item.changeStatus(expectedRevision, context.subjectId(), status);
        return serviceViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional(readOnly = true)
    public List<MedicationView> listMedications(String query, String medicationType, String status,
                                                Long organizationId) {
        ExecutionContext context = current();
        List<Medication> items = medicationRepository.findByTenantIdOrderByName(context.tenantId()).stream()
                .filter(value -> blank(medicationType) || medicationType.equals(value.medicationType()))
                .filter(value -> blank(status) || status.equals(value.status()))
                .filter(value -> matches(query, value.code(), value.name(), value.aliasName(), value.doseForm(),
                        value.preparationSpec()))
                .limit(500).toList();
        return medicationViews(context.tenantId(), items, organizationId);
    }

    @Transactional(readOnly = true)
    public List<MedicationView> findMedicationsByProductCatalogItemIds(Long tenantId, Long organizationId,
                                                                      Collection<Long> catalogItemIds) {
        if (catalogItemIds == null || catalogItemIds.isEmpty()) return List.of();
        List<MedicationProduct> products = productRepository.findByTenantIdAndIdIn(tenantId, catalogItemIds);
        List<Long> medIds = products.stream().map(MedicationProduct::medicationId).distinct().toList();
        if (medIds.isEmpty()) return List.of();
        List<Medication> items = medicationRepository.findByTenantIdAndIdIn(tenantId, medIds);
        return medicationViews(tenantId, items, organizationId);
    }

    @Transactional(readOnly = true)
    public PageResult<MedicationView> searchMedications(String query, String medicationType, String status,
                                                         Long organizationId, int page, int size) {
        ExecutionContext context = current();
        int normalizedPage = Math.max(page, 0);
        int normalizedSize = Math.max(10, Math.min(size, 100));
        Page<Medication> result = medicationRepository.search(context.tenantId(), query, medicationType, status,
                PageRequest.of(normalizedPage, normalizedSize,
                        Sort.by("name").ascending().and(Sort.by("id").ascending())));
        return new PageResult<>(medicationViews(context.tenantId(), result.getContent(), organizationId),
                result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize());
    }

    @Transactional(readOnly = true)
    public MedicationView medication(Long id, Long organizationId) {
        return medicationViews(current().tenantId(), List.of(requireMedication(current().tenantId(), id)), organizationId).getFirst();
    }

    @Transactional(readOnly = true)
    public PageResult<MedicationProductEntryView> searchProducts(
            String query, String medicationType, String status, Long organizationId, int page, int size,
            boolean stockable, boolean dispensable) {
        Long tenantId = current().tenantId();
        if (stockable && organizationId == null) throw badRequest("ORGANIZATION_REQUIRED", "请选择机构");
        if (organizationId != null) {
            organizationDirectory.requireOrganization(tenantId, organizationId);
            if (!current().hasAuthority("MASTER_DATA.MANAGE") && !java.util.Objects.equals(current().organizationId(), organizationId))
                throw com.rhn.shared.api.BusinessErrors.forbidden("ORG_CATALOG_SCOPE_FORBIDDEN", "不能查询当前工作机构以外的经营目录");
        }
        int limit = Math.max(10, Math.min(size, 100));
        var sort = Sort.by("name").ascending().and(Sort.by("id").ascending());
        Long sourceOrganizationId = organizationId == null ? null
                : organizationDirectory.catalogSourceOrganizationId(tenantId, organizationId);
        var found = productRepository.searchProducts(tenantId, query == null ? null : query.trim(), medicationType,
                stockable ? "ACTIVE" : status, stockable, dispensable, organizationId, sourceOrganizationId, LocalDate.now(),
                PageRequest.of(Math.max(0, page), limit, sort));
        var medications = medicationViews(tenantId, medicationRepository.findByTenantIdAndIdIn(tenantId,
                found.getContent().stream().map(MedicationProduct::medicationId).distinct().toList()), organizationId)
                .stream().collect(Collectors.toMap(MedicationView::id, Function.identity()));
        var products = productViews(tenantId, found.getContent(), manufacturerRepository.findByTenantIdOrderByName(tenantId)
                .stream().collect(Collectors.toMap(Manufacturer::id, Function.identity())), organizationId);
        var entries = products.stream().map(product -> new MedicationProductEntryView(
                product, medications.get(product.medicationId()))).toList();
        return new PageResult<>(entries, found.getTotalElements(), found.getTotalPages(), Math.max(0, page), limit);
    }

    @Transactional
    public MedicationView createMedication(MedicationCommand command, Long organizationId) {
        ExecutionContext context = current();
        validateMedication(command);
        var frequency = resolveMedicationFrequency(context, command.defaultFrequency(), organizationId);
        var route = resolveMedicationRoute(context, command.defaultRoute());
        if (medicationRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("MEDICATION_CODE_DUPLICATE", "当前租户已存在相同通用药品编码");
        }
        Medication item = new Medication(context.tenantId(), context.subjectId(),
                MasterDataItemTypes.forMedication(command.medicationType()), command.code(), command.name(),
                command.aliasName(), command.medicationType(), command.doseForm(),
                command.preparationSpec(), command.preparationUnit(), command.strengthValue(), command.strengthUnit(),
                command.storageType(), command.prescriptionDrug(), command.essentialDrug(), command.antimicrobial(),
                command.antimicrobialLevel(), antimicrobialOutpatientAllowed(command),
                antimicrobialConsultationRequired(command), antimicrobialEmergencyAllowed(command),
                antimicrobialMaxDays(command), command.skinTestRequired(), skinTestMethod(command),
                skinTestSolutionMode(command), skinTestObservationMinutes(command),
                skinTestResultValidityHours(command), skinTestInstructions(command), command.defaultDose(),
                command.defaultDoseUnit(), route == null ? null : route.code(), frequency == null ? null : frequency.id(),
                frequency == null ? null : frequency.code(),
                command.chronicDiseaseDrug(), command.singleOrder(), command.status());
        item.assignDefaultRoute(route == null ? null : route.id(), route == null ? null : route.code());
        item = medicationRepository.save(item);
        medicationSemantics.captureMedication(item);
        attributeSubjectRepository.save(ItemAttributeSubject.medication(
                context.tenantId(), item.id(), context.subjectId()));
        return medicationViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional(readOnly = true)
    public void validateMedicationForImport(MedicationCommand command) {
        ExecutionContext context = current();
        validateMedication(command);
        resolveMedicationRoute(context, command.defaultRoute());
        resolveMedicationFrequency(context, command.defaultFrequency(), null);
        if (medicationRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("MEDICATION_CODE_DUPLICATE", "当前租户已存在相同通用药品编码");
        }
    }

    @Transactional
    public MedicationView updateMedication(Long id, long expectedRevision, MedicationCommand command,
                                           Long organizationId) {
        ExecutionContext context = current();
        Medication item = medicationRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到通用药品"));
        if (!java.util.Objects.equals(item.preparationUnit(), command.preparationUnit())
                && productRepository.existsByTenantIdAndMedicationId(context.tenantId(), id)) {
            throw conflict("MEDICATION_UNIT_IN_USE", "最小单位已被厂家产品使用，禁止修改；请新建正确单位的药品档案");
        }
        requireRevision(item.revision(), expectedRevision, "MEDICATION_REVISION_STALE", "药品知识已被其他用户修改，请刷新后重试");
        if (!item.medicationType().equals(command.medicationType())) {
            throw badRequest("MEDICATION_TYPE_IMMUTABLE", "药品类型创建后不允许直接修改，请新建正确类型的药品主档");
        }
        validateMedication(command);
        var frequency = resolveMedicationFrequency(context, command.defaultFrequency(), organizationId);
        var route = resolveMedicationRoute(context, command.defaultRoute());
        medicationSemantics.captureMedication(item);
        item.update(expectedRevision, context.subjectId(), MasterDataItemTypes.forMedication(command.medicationType()),
                command.name(), command.aliasName(),
                command.medicationType(), command.doseForm(), command.preparationSpec(), command.preparationUnit(),
                command.strengthValue(), command.strengthUnit(), command.storageType(), command.prescriptionDrug(),
                command.essentialDrug(), command.antimicrobial(), command.antimicrobialLevel(),
                antimicrobialOutpatientAllowed(command), antimicrobialConsultationRequired(command),
                antimicrobialEmergencyAllowed(command), antimicrobialMaxDays(command),
                command.skinTestRequired(), skinTestMethod(command), skinTestSolutionMode(command),
                skinTestObservationMinutes(command), skinTestResultValidityHours(command),
                skinTestInstructions(command), command.defaultDose(), command.defaultDoseUnit(),
                route == null ? null : route.code(), frequency == null ? null : frequency.id(),
                frequency == null ? null : frequency.code(), command.chronicDiseaseDrug(),
                command.singleOrder(), command.status());
        item.assignDefaultRoute(route == null ? null : route.id(), route == null ? null : route.code());
        medicationSemantics.captureMedication(item);
        return medicationViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional
    public MedicationView changeMedicationStatus(Long id, long expectedRevision, String status, Long organizationId) {
        ExecutionContext context = current();
        requireCode(MasterDataDictionaryCodes.STATUS, status);
        Medication item = requireMedication(context.tenantId(), id);
        requireRevision(item.revision(), expectedRevision, "MEDICATION_REVISION_STALE", "药品知识已被其他用户修改，请刷新后重试");
        medicationSemantics.captureMedication(item);
        item.changeStatus(expectedRevision, context.subjectId(), status);
        medicationSemantics.captureMedication(item);
        return medicationViews(context.tenantId(), List.of(item), organizationId).getFirst();
    }

    @Transactional(readOnly = true)
    public List<ManufacturerView> listManufacturers(String query) {
        Long tenantId = current().tenantId();
        return manufacturerRepository.findByTenantIdOrderByName(tenantId).stream()
                .filter(value -> matches(query, value.code(), value.name(), value.shortName()))
                .map(this::manufacturerView).toList();
    }

    @Transactional
    public ManufacturerView createManufacturer(ManufacturerCommand command) {
        ExecutionContext context = current();
        requireCode(MasterDataDictionaryCodes.MANUFACTURER_TYPE, command.manufacturerType());
        if (!blank(command.productionPlace())) {
            requireCode(MasterDataDictionaryCodes.PRODUCTION_PLACE, command.productionPlace());
        }
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (manufacturerRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("MANUFACTURER_CODE_DUPLICATE", "当前租户已存在相同生产企业编码");
        }
        return manufacturerView(manufacturerRepository.save(new Manufacturer(context.tenantId(), context.subjectId(),
                command.code(), command.name(), command.shortName(), command.manufacturerType(),
                command.productionPlace(), command.countryCode(), command.address(), command.status())));
    }

    @Transactional
    public ManufacturerView updateManufacturer(Long id, long expectedRevision, ManufacturerCommand command) {
        ExecutionContext context = current();
        requireCode(MasterDataDictionaryCodes.MANUFACTURER_TYPE, command.manufacturerType());
        if (!blank(command.productionPlace())) requireCode(MasterDataDictionaryCodes.PRODUCTION_PLACE, command.productionPlace());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        Manufacturer value = manufacturerRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("MANUFACTURER_NOT_FOUND", "未找到生产企业"));
        requireRevision(value.revision(), expectedRevision, "MANUFACTURER_REVISION_STALE", "生产企业已被其他用户修改，请刷新后重试");
        if (manufacturerRepository.existsByTenantIdAndCodeAndIdNot(context.tenantId(), command.code(), id)) {
            throw conflict("MANUFACTURER_CODE_DUPLICATE", "当前租户已存在相同生产企业编码");
        }
        value.update(expectedRevision, context.subjectId(), command.code(), command.name(), command.shortName(),
                command.manufacturerType(), command.productionPlace(), command.countryCode(), command.address(),
                command.status());
        return manufacturerView(manufacturerRepository.saveAndFlush(value));
    }

    @Transactional
    public ManufacturerView changeManufacturerStatus(Long id, long expectedRevision, String status) {
        ExecutionContext context = current(); requireCode(MasterDataDictionaryCodes.STATUS, status);
        Manufacturer value = manufacturerRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("MANUFACTURER_NOT_FOUND", "未找到生产企业"));
        requireRevision(value.revision(), expectedRevision, "MANUFACTURER_REVISION_STALE", "生产企业已被其他用户修改，请刷新后重试");
        value.changeStatus(expectedRevision, context.subjectId(), status);
        return manufacturerView(manufacturerRepository.saveAndFlush(value));
    }

    @Transactional
    public MedicationProductView createProduct(ProductCommand command, Long organizationId) {
        ExecutionContext context = current();
        Medication medication = medicationRepository.lockByIdAndTenantId(command.medicationId(), context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到通用药品"));
        Manufacturer manufacturer = manufacturerRepository.findByIdAndTenantId(command.manufacturerId(), context.tenantId())
                .orElseThrow(() -> notFound("MANUFACTURER_NOT_FOUND", "未找到生产企业"));
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (!blank(command.marketStatus())) {
            requireCode(MasterDataDictionaryCodes.PRODUCT_MARKET_STATUS, command.marketStatus());
        }
        if (!blank(command.productionPlace())) {
            requireCode(MasterDataDictionaryCodes.PRODUCTION_PLACE, command.productionPlace());
        }
        if (!blank(command.shelfLifeUnit())) {
            requireCode(MasterDataDictionaryCodes.SHELF_LIFE_UNIT, command.shelfLifeUnit());
        }
        requirePair(command.shelfLifeValue(), command.shelfLifeUnit(), "MEDICATION_PRODUCT_SHELF_LIFE_REQUIRED",
                "产品有效期数值和单位必须同时填写");
        if (productRepository.existsByTenantIdAndCode(context.tenantId(), command.code())) {
            throw conflict("MEDICATION_PRODUCT_CODE_DUPLICATE", "当前租户已存在相同药品产品编码");
        }
        MedicationProduct product = productRepository.save(new MedicationProduct(context.tenantId(), context.subjectId(),
                MasterDataItemTypes.MEDICATION_PRODUCT, medication.id(), manufacturer.id(), command.code(),
                medication.name(), medication.preparationUnit(), command.tradeName(),
                command.approvalCode(), command.traceCode(), command.approvalFrom(), command.approvalTo(), command.registrationCode(),
                command.registrationFrom(), command.registrationTo(), command.purchaseCode(), command.marketStatus(),
                command.productionPlace(), command.otc(), command.centralPurchase(), command.importAllowed(),
                command.traceSplitRequired(), command.orderable(), command.chargeable(), command.stocked(),
                command.shelfLifeValue(), command.shelfLifeUnit(), command.status(), command.validFrom(),
                command.validTo(), command.indication(), command.instruction()));
        attributeSubjectRepository.save(ItemAttributeSubject.catalogItem(
                context.tenantId(), product.id(), context.subjectId()));
        return productViews(context.tenantId(), List.of(product), Map.of(manufacturer.id(), manufacturer),
                organizationId).getFirst();
    }

    @Transactional
    public MedicationProductView createProductSetup(ProductCommand productCommand, PackageCommand packageCommand,
                                                    AdoptionCommand adoptionCommand, BigDecimal purchasePrice,
                                                    BigDecimal salePrice, String priceDocumentCode) {
        MedicationProductView created = createProduct(productCommand, adoptionCommand.organizationId());
        PackageView itemPackage = createPackage(created.id(), packageCommand);
        adopt(created.id(), adoptionCommand);
        if (purchasePrice != null) {
            createPrice(created.id(), new PriceCommand(adoptionCommand.organizationId(), itemPackage.id(), "PURCHASE",
                    purchasePrice, "CNY", priceDocumentCode, "药品建档初始采购价",
                    adoptionCommand.validFrom(), adoptionCommand.validTo(), "ACTIVE"));
        }
        if (salePrice != null) {
            createPrice(created.id(), new PriceCommand(adoptionCommand.organizationId(), itemPackage.id(), "SALE",
                    salePrice, "CNY", priceDocumentCode, "药品建档初始零售价",
                    adoptionCommand.validFrom(), adoptionCommand.validTo(), "ACTIVE"));
        }
        MedicationProduct product = requireProduct(current().tenantId(), created.id());
        Manufacturer manufacturer = manufacturerRepository.findByIdAndTenantId(product.manufacturerId(), current().tenantId())
                .orElseThrow(() -> notFound("MANUFACTURER_NOT_FOUND", "未找到生产企业"));
        return productViews(current().tenantId(), List.of(product), Map.of(manufacturer.id(), manufacturer),
                adoptionCommand.organizationId()).getFirst();
    }

    @Transactional
    public MedicationProductView updateProduct(Long id, long expectedRevision, ProductCommand command,
                                               Long organizationId) {
        ExecutionContext context = current();
        MedicationProduct product = requireProduct(context.tenantId(), id);
        requireRevision(product.revision(), expectedRevision, "MEDICATION_PRODUCT_REVISION_STALE",
                "药品产品已被其他用户修改，请刷新后重试");
        Medication medication = requireMedication(context.tenantId(), product.medicationId());
        Manufacturer manufacturer = manufacturerRepository.findByIdAndTenantId(command.manufacturerId(), context.tenantId())
                .orElseThrow(() -> notFound("MANUFACTURER_NOT_FOUND", "未找到生产企业"));
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (!blank(command.marketStatus())) {
            requireCode(MasterDataDictionaryCodes.PRODUCT_MARKET_STATUS, command.marketStatus());
        }
        if (!blank(command.productionPlace())) {
            requireCode(MasterDataDictionaryCodes.PRODUCTION_PLACE, command.productionPlace());
        }
        if (!blank(command.shelfLifeUnit())) {
            requireCode(MasterDataDictionaryCodes.SHELF_LIFE_UNIT, command.shelfLifeUnit());
        }
        requirePair(command.shelfLifeValue(), command.shelfLifeUnit(), "MEDICATION_PRODUCT_SHELF_LIFE_REQUIRED",
                "产品有效期数值和单位必须同时填写");
        product.update(expectedRevision, context.subjectId(), manufacturer.id(), medication.name(),
                medication.preparationUnit(), command.tradeName(), command.approvalCode(), command.traceCode(),
                command.approvalFrom(), command.approvalTo(), command.registrationCode(), command.registrationFrom(),
                command.registrationTo(), command.purchaseCode(), command.marketStatus(), command.productionPlace(),
                command.otc(), command.centralPurchase(), command.importAllowed(), command.traceSplitRequired(),
                command.orderable(), command.chargeable(), command.stocked(), command.shelfLifeValue(),
                command.shelfLifeUnit(), command.status(), command.validFrom(), command.validTo(),
                command.indication(), command.instruction());
        return productViews(context.tenantId(), List.of(productRepository.saveAndFlush(product)),
                Map.of(manufacturer.id(), manufacturer), organizationId).getFirst();
    }

    private void validatePackageBase(Long catalogItemId, Long packageId, Long baseId) {
        Long tenantId = current().tenantId();
        entityManager.createNativeQuery("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT = :tenant and ID_CATALOG_ITEM = :id for update")
                .setParameter("tenant", tenantId).setParameter("id", catalogItemId).getSingleResult();
        Set<Long> seen = new java.util.HashSet<>();
        if (packageId != null) seen.add(packageId);
        while (baseId != null) {
            if (!seen.add(baseId)) throw badRequest("PACKAGE_BASE_CYCLE", "基础包装不能引用自身或形成循环");
            ItemPackage base = packageRepository.findByIdAndTenantId(baseId, tenantId)
                    .orElseThrow(() -> badRequest("PACKAGE_BASE_NOT_FOUND", "基础包装不存在或不属于当前租户"));
            if (!base.catalogItemId().equals(catalogItemId))
                throw badRequest("PACKAGE_BASE_PRODUCT_MISMATCH", "基础包装必须属于同一产品");
            baseId = base.basePackageId();
        }
    }

    @Transactional
    public PackageView createPackage(Long catalogItemId, PackageCommand command) {
        ExecutionContext context = current();
        requireProduct(context.tenantId(), catalogItemId);
        requireCode(MasterDataDictionaryCodes.PACKAGE_USE, command.usageType());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        validatePackageBase(catalogItemId, null, command.basePackageId());
        ItemPackage value = packageRepository.save(new ItemPackage(context.tenantId(), catalogItemId,
                command.basePackageId(), command.unitCode(), command.unitName(), command.packageSpec(),
                command.quantityFactor(), command.usageType(), command.barcode(), command.defaultPurchase(),
                command.defaultSale(), command.defaultDispense(), command.status(), command.validFrom(), command.validTo()));
        return packageView(value);
    }

    @Transactional
    public PackageView updatePackage(Long id, PackageCommand command) {
        ExecutionContext context = current();
        ItemPackage value = packageRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PACKAGE_NOT_FOUND", "未找到产品包装"));
        requireCode(MasterDataDictionaryCodes.PACKAGE_USE, command.usageType());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        validatePackageBase(value.catalogItemId(), id, command.basePackageId());
        value.update(command.basePackageId(), command.unitCode(), command.unitName(), command.packageSpec(),
                command.quantityFactor(), command.usageType(), command.barcode(), command.defaultPurchase(),
                command.defaultSale(), command.defaultDispense(), command.status(), command.validFrom(),
                command.validTo());
        return packageView(packageRepository.save(value));
    }

    @Transactional
    public OrganizationAdoptionView adopt(Long catalogItemId, AdoptionCommand command) {
        ExecutionContext context = current();
        requireCatalogItem(context.tenantId(), catalogItemId);
        organizationDirectory.requireOrganization(context.tenantId(), command.organizationId());
        if (command.defaultDepartmentId() != null) {
            organizationDirectory.requireDepartment(context.tenantId(), command.organizationId(), command.defaultDepartmentId());
        }
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (adoptionRepository.findFirstByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                context.tenantId(), command.organizationId(), catalogItemId).isPresent()) {
            throw conflict("ORGANIZATION_CATALOG_ITEM_EXISTS", "该机构已经采用此目录项，请在后续版本中维护状态");
        }
        return adoptionView(adoptionRepository.save(new OrganizationCatalogItem(context.tenantId(),
                context.subjectId(), command.organizationId(), catalogItemId, command.defaultDepartmentId(),
                command.localCode(), command.localName(), command.orderable(), command.executable(),
                command.chargeable(), command.purchasable(), command.stocked(), command.dispensable(),
                command.returnable(), command.status(), command.validFrom(), command.validTo())));
    }

    @Transactional
    public PriceView createPrice(Long catalogItemId, PriceCommand command) {
        ExecutionContext context = current();
        requireCatalogItem(context.tenantId(), catalogItemId);
        if (command.organizationId() != null) {
            organizationDirectory.requireOrganization(context.tenantId(), command.organizationId());
        }
        if (command.packageId() != null) {
            var packaging = packageRepository.findByIdAndTenantId(command.packageId(), context.tenantId())
                    .orElseThrow(() -> badRequest("PACKAGE_NOT_FOUND", "未找到产品包装"));
            if (!packaging.catalogItemId().equals(catalogItemId))
                throw badRequest("ITEM_PACKAGE_CATALOG_MISMATCH", "价格包装必须属于当前产品");
        }
        requireCode(MasterDataDictionaryCodes.PRICE_TYPE, command.priceType());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        return priceView(priceRepository.save(new CatalogPrice(context.tenantId(), context.subjectId(),
                catalogItemId, command.organizationId(), command.packageId(), command.priceType(), command.price(),
                command.currencyCode(), command.priceDocumentCode(), command.priceReason(), command.validFrom(),
                command.validTo(), command.status())));
    }

    private List<ServiceView> serviceViews(Long tenantId, List<ServiceCatalogItem> items, Long organizationId) {
        List<Long> ids = items.stream().map(ServiceCatalogItem::id).toList();
        Map<Long, OrganizationCatalogItem> adoptions = adoptionMap(tenantId, organizationId, ids);
        Map<Long, List<CatalogPrice>> prices = priceMap(tenantId, ids);
        Map<Long, LaboratoryService> laboratories = laboratoryServiceRepository
                .findByTenantIdAndCatalogItemIdIn(tenantId, ids).stream()
                .collect(Collectors.toMap(LaboratoryService::catalogItemId, Function.identity()));
        Map<Long, List<LaboratoryServiceSpecimen>> specimens = laboratorySpecimenRepository
                .findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscSortOrderAsc(tenantId, ids).stream()
                .collect(Collectors.groupingBy(LaboratoryServiceSpecimen::catalogItemId));
        Map<Long, ExaminationService> examinations = examinationServiceRepository
                .findByTenantIdAndCatalogItemIdIn(tenantId, ids).stream()
                .collect(Collectors.toMap(ExaminationService::catalogItemId, Function.identity()));
        Map<Long, List<ServiceVariant>> variants = serviceVariantRepository
                .findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscSortOrderAsc(tenantId, ids).stream()
                .collect(Collectors.groupingBy(ServiceVariant::catalogItemId));
        return items.stream().map(value -> new ServiceView(value.id(), value.revision(), value.itemTypeId(),
                value.itemMasterId(), value.code(), value.name(),
                value.unitCode(), value.orderable(), value.chargeable(), value.status(), value.validFrom(), value.validTo(),
                value.serviceType(), value.serviceSubtype(), value.usageType(), value.medicalTechnology(),
                value.combinationItem(), value.singleOrder(), value.specimenType(), value.examinationType(),
                value.accountingCategory(), value.duplicateRule(), value.multiSitePrice(), value.freeSiteCount(),
                value.maxBodySiteCount(), value.mutualRecognitionCode(), value.pregnancyAlert(),
                value.attention(), value.examinationNotes(), laboratoryView(laboratories.get(value.id()),
                        specimens.getOrDefault(value.id(), List.of())),
                examinationView(examinations.get(value.id()), variants.getOrDefault(value.id(), List.of())),
                adoptionView(adoptions.get(value.id()), organizationId), priceViews(prices.get(value.id())))).toList();
    }

    private LaboratoryServiceView laboratoryView(LaboratoryService value,
                                                  List<LaboratoryServiceSpecimen> specimens) {
        if (value == null) return null;
        return new LaboratoryServiceView(value.laboratoryMethod(), value.reportDuration(),
                value.reportDurationUnit(), value.fastingRequired(), value.pointOfCare(),
                value.collectionDescription(), specimens.stream().map(specimen -> new LaboratorySpecimenView(
                        specimen.id(), specimen.specimenItemId(), specimen.containerItemId(),
                        specimen.minimumQuantity(), specimen.minimumQuantityUnit(), specimen.defaultSpecimen(),
                        specimen.requiredSpecimen(), specimen.sortOrder(), specimen.collectionDescription(),
                        specimen.status())).toList());
    }

    private ExaminationServiceView examinationView(ExaminationService value, List<ServiceVariant> variants) {
        if (value == null) return null;
        return new ExaminationServiceView(value.examinationType(), value.bodySiteRequired(), value.multiBodySite(),
                value.maxBodySiteCount(), value.preparationDescription(), variants.stream()
                .map(variant -> new ServiceVariantView(variant.id(), variant.bodySiteConceptId(), variant.code(),
                        variant.name(), variant.methodType(), variant.bodySiteRequired(),
                        variant.mutualRecognitionCode(), variant.sortOrder(), variant.status()))
                .toList());
    }

    private void synchronizeServiceTypeExtension(ServiceCatalogItem item, ServiceCommand command) {
        if ("LABORATORY".equals(command.serviceType())) {
            serviceVariantRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
            examinationAttachmentRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
            examinationServiceRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
            LaboratoryService laboratory = laboratoryServiceRepository
                    .findByTenantIdAndCatalogItemId(item.tenantId(), item.id())
                    .orElseGet(() -> new LaboratoryService(item.tenantId(), item.id(), command.attention()));
            laboratory.synchronizeLegacy(command.attention());
            laboratoryServiceRepository.save(laboratory);
            return;
        }
        laboratorySpecimenRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
        laboratoryServiceRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
        if ("EXAMINATION".equals(command.serviceType())) {
            ExaminationService examination = examinationServiceRepository
                    .findByTenantIdAndCatalogItemId(item.tenantId(), item.id())
                    .orElseGet(() -> new ExaminationService(item.tenantId(), item.id(), command.examinationType(),
                            command.maxBodySiteCount(), command.attention()));
            examination.synchronizeLegacy(command.examinationType(), command.maxBodySiteCount(), command.attention());
            examination.synchronizeLegacyPricing(command.multiSitePrice(), command.freeSiteCount(),
                    command.maxBodySiteCount());
            examinationServiceRepository.save(examination);
        } else {
            serviceVariantRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
            examinationAttachmentRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
            examinationServiceRepository.deleteByTenantIdAndCatalogItemId(item.tenantId(), item.id());
        }
    }

    private List<MedicationView> medicationViews(Long tenantId, List<Medication> items, Long organizationId) {
        List<Long> medicationIds = items.stream().map(Medication::id).toList();
        var classifications = medicationTerminologyDirectory.classifications(tenantId, medicationIds);
        var allergenConceptIds = medicationTerminologyDirectory.allergenConceptIds(tenantId, medicationIds);
        List<MedicationProduct> products = medicationIds.isEmpty() ? List.of()
                : productRepository.findByTenantIdAndMedicationIdIn(tenantId, medicationIds);
        Map<Long, Manufacturer> manufacturers = manufacturerRepository.findByTenantIdOrderByName(tenantId).stream()
                .collect(Collectors.toMap(Manufacturer::id, Function.identity()));
        Map<Long, List<MedicationProductView>> productViews = productViews(tenantId, products, manufacturers,
                organizationId).stream().collect(Collectors.groupingBy(MedicationProductView::medicationId));
        return items.stream().map(value -> new MedicationView(value.id(), value.revision(), value.itemTypeId(),
                value.itemMasterId(), value.code(), value.name(),
                value.aliasName(), value.medicationType(), value.doseForm(), value.preparationSpec(),
                value.preparationUnit(), value.strengthValue(), value.strengthUnit(), value.storageType(),
                value.prescriptionDrug(), value.essentialDrug(), value.antimicrobial(), value.antimicrobialLevel(),
                value.antimicrobialOutpatientAllowed(), value.antimicrobialConsultationRequired(),
                value.antimicrobialEmergencyAllowed(), value.antimicrobialMaxDays(), value.skinTestRequired(),
                value.skinTestMethod(), value.skinTestSolutionMode(), value.skinTestObservationMinutes(),
                value.skinTestResultValidityHours(), value.skinTestInstructions(),
                value.defaultDose(), value.defaultDoseUnit(), value.defaultRoute(),
                value.defaultFrequencyId(), value.defaultFrequency(), value.chronicDiseaseDrug(), value.singleOrder(), value.status(),
                classifications.getOrDefault(value.id(), List.of()), allergenConceptIds.getOrDefault(value.id(), List.of()),
                productViews.getOrDefault(value.id(), List.of()))).toList();
    }

    private List<MedicationProductView> productViews(Long tenantId, List<MedicationProduct> products,
                                                     Map<Long, Manufacturer> manufacturers, Long organizationId) {
        List<Long> ids = products.stream().map(MedicationProduct::id).toList();
        Map<Long, List<ItemPackage>> packages = ids.isEmpty() ? Map.of() : packageRepository
                .findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscQuantityFactorAsc(tenantId, ids).stream()
                .collect(Collectors.groupingBy(ItemPackage::catalogItemId));
        Map<Long, OrganizationCatalogItem> adoptions = adoptionMap(tenantId, organizationId, ids);
        Map<Long, List<CatalogPrice>> prices = priceMap(tenantId, ids);
        return products.stream().map(value -> new MedicationProductView(value.id(), value.revision(),
                value.itemTypeId(), value.itemMasterId(), value.medicationId(), value.manufacturerId(),
                nameOf(manufacturers.get(value.manufacturerId())),
                value.code(), value.name(), value.unitCode(), value.tradeName(), value.approvalCode(),
                value.traceCode(), value.approvalFrom(), value.approvalTo(), value.registrationCode(), value.registrationFrom(),
                value.registrationTo(), value.purchaseCode(), value.marketStatus(), value.productionPlace(),
                value.otc(), value.centralPurchase(), value.importAllowed(), value.traceSplitRequired(),
                value.orderable(), value.chargeable(), value.stocked(), value.shelfLifeValue(), value.shelfLifeUnit(),
                value.status(), value.validFrom(), value.validTo(), value.indication(), value.instruction(),
                packages.getOrDefault(value.id(), List.of()).stream().map(this::packageView).toList(),
                adoptionView(adoptions.get(value.id()), organizationId), priceViews(prices.get(value.id())))).toList();
    }

    private Map<Long, OrganizationCatalogItem> adoptionMap(Long tenantId, Long organizationId, Collection<Long> itemIds) {
        if (organizationId == null || itemIds.isEmpty()) return Map.of();
        java.time.LocalDate today = java.time.LocalDate.now();
        Map<Long, OrganizationCatalogItem> localRules = adoptionRepository
                .findByTenantIdAndOrganizationIdAndCatalogItemIdIn(tenantId, organizationId, itemIds).stream()
                .filter(value -> value.overlaps(today, today))
                .collect(Collectors.toMap(OrganizationCatalogItem::catalogItemId, Function.identity(),
                        (left, right) -> left.validFrom().isAfter(right.validFrom()) ? left : right));
        Map<Long, OrganizationCatalogItem> resolved = localRules.values().stream()
                .filter(value -> value.effectiveAt(today))
                .collect(Collectors.toMap(OrganizationCatalogItem::catalogItemId, Function.identity()));
        Long sourceOrganizationId = organizationDirectory.catalogSourceOrganizationId(tenantId, organizationId);
        if (sourceOrganizationId == null) return resolved;
        adoptionRepository.findByTenantIdAndOrganizationIdAndCatalogItemIdIn(
                        tenantId, sourceOrganizationId, itemIds).stream()
                .filter(value -> !localRules.containsKey(value.catalogItemId()))
                .filter(value -> value.effectiveAt(today))
                .forEach(value -> resolved.merge(value.catalogItemId(), value,
                        (left, right) -> left.validFrom().isAfter(right.validFrom()) ? left : right));
        return resolved;
    }

    private Map<Long, List<CatalogPrice>> priceMap(Long tenantId, Collection<Long> itemIds) {
        if (itemIds.isEmpty()) return Map.of();
        return priceRepository.findByTenantIdAndCatalogItemIdInOrderByValidFromDesc(tenantId, itemIds).stream()
                .collect(Collectors.groupingBy(CatalogPrice::catalogItemId));
    }

    private ManufacturerView manufacturerView(Manufacturer value) {
        return new ManufacturerView(value.id(), value.revision(), value.code(), value.name(), value.shortName(),
                value.manufacturerType(), value.productionPlace(), value.countryCode(), value.address(), value.status());
    }

    private PackageView packageView(ItemPackage value) {
        return new PackageView(value.id(), value.basePackageId(), value.unitCode(), value.unitName(), value.packageSpec(),
                value.quantityFactor(), value.usageType(), value.barcode(), value.defaultPurchase(), value.defaultSale(),
                value.defaultDispense(), value.status(), value.validFrom(), value.validTo());
    }

    private OrganizationAdoptionView adoptionView(OrganizationCatalogItem value) {
        return adoptionView(value, null);
    }

    private OrganizationAdoptionView adoptionView(OrganizationCatalogItem value, Long requestingOrganizationId) {
        if (value == null) return null;
        Long defaultDepartmentId = requestingOrganizationId != null
                && !requestingOrganizationId.equals(value.organizationId()) ? null : value.defaultDepartmentId();
        return new OrganizationAdoptionView(value.id(), value.revision(), value.organizationId(), value.catalogItemId(),
                defaultDepartmentId, value.localCode(), value.localName(), value.orderable(), value.executable(),
                value.chargeable(), value.purchasable(), value.stocked(), value.dispensable(), value.returnable(),
                value.status(), value.validFrom(), value.validTo(), value.replacesAdoptionId());
    }

    private List<PriceView> priceViews(List<CatalogPrice> values) {
        return values == null ? List.of() : values.stream().map(this::priceView).toList();
    }

    private PriceView priceView(CatalogPrice value) {
        return new PriceView(value.id(), value.revision(), value.organizationId(), value.packageId(), value.priceType(),
                value.price(), value.currencyCode(), value.priceDocumentCode(), value.priceReason(), value.validFrom(),
                value.validTo(), value.status(), value.replacesPriceId());
    }

    private String nameOf(Manufacturer value) { return value == null ? "未知厂家" : value.name(); }

    private void validateService(ServiceCommand command) {
        requireCode(MasterDataDictionaryCodes.SERVICE_TYPE, command.serviceType());
        requireCode(MasterDataDictionaryCodes.SERVICE_USE, command.usageType());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (!blank(command.duplicateRule())) {
            requireCode(MasterDataDictionaryCodes.SERVICE_DUPLICATE_RULE, command.duplicateRule());
        }
        if (!command.singleOrder() && command.orderable() && !command.combinationItem()) {
            throw badRequest("SERVICE_SINGLE_ORDER_CONFLICT", "非单开项目不能作为普通独立开立项");
        }
    }

    private void validateMedication(MedicationCommand command) {
        requireCode(MasterDataDictionaryCodes.MEDICATION_TYPE, command.medicationType());
        boolean western = "WESTERN".equals(command.medicationType());
        boolean herbal = "HERBAL".equals(command.medicationType());
        boolean vaccine = "VACCINE".equals(command.medicationType());
        if (!blank(command.doseForm())) requireCode(MasterDataDictionaryCodes.DOSE_FORM, command.doseForm());
        if (!blank(command.storageType())) requireCode(MasterDataDictionaryCodes.STORAGE_TYPE, command.storageType());
        if (!blank(command.antimicrobialLevel())) {
            requireCode(MasterDataDictionaryCodes.ANTIMICROBIAL_LEVEL, command.antimicrobialLevel());
        }
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (command.strengthValue() != null && blank(command.strengthUnit())) {
            throw badRequest("MEDICATION_STRENGTH_UNIT_REQUIRED", "填写药品含量时必须同时填写含量单位");
        }
        requirePair(command.defaultDose(), command.defaultDoseUnit(), "MEDICATION_DEFAULT_DOSE_UNIT_REQUIRED",
                "填写默认剂量时必须同时填写剂量单位");
        if (!command.antimicrobial() && !blank(command.antimicrobialLevel())) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_LEVEL_CONFLICT", "非抗菌药物不能设置抗菌药等级");
        }
        if (command.antimicrobial() && blank(command.antimicrobialLevel())) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_LEVEL_REQUIRED", "抗菌药物必须设置分级管理等级");
        }
        if (!western && (command.antimicrobial() || !blank(command.antimicrobialLevel()))) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_TYPE_INVALID", "仅西药和化学药可维护抗菌药物及抗菌药等级");
        }
        if (!western && command.skinTestRequired()) {
            throw badRequest("MEDICATION_SKIN_TEST_TYPE_INVALID", "仅西药和化学药可维护药品皮试属性");
        }
        if (command.antimicrobial()) {
            if (command.antimicrobialMaxDays() != null
                    && (command.antimicrobialMaxDays() < 1 || command.antimicrobialMaxDays() > 90)) {
                throw badRequest("MEDICATION_ANTIMICROBIAL_MAX_DAYS_INVALID", "抗菌药门诊疗程上限应为 1 至 90 天");
            }
            if ("SPECIAL".equals(command.antimicrobialLevel()) && antimicrobialOutpatientAllowed(command)) {
                throw badRequest("MEDICATION_SPECIAL_ANTIMICROBIAL_OUTPATIENT_INVALID", "特殊使用级抗菌药不得配置为门诊常规可用");
            }
            if ("SPECIAL".equals(command.antimicrobialLevel()) && !antimicrobialConsultationRequired(command)) {
                throw badRequest("MEDICATION_SPECIAL_ANTIMICROBIAL_CONSULT_REQUIRED", "特殊使用级抗菌药必须配置会诊或审批要求");
            }
        }
        if (command.skinTestRequired()) {
            if (!Set.of("INTRADERMAL", "PRICK", "OTHER").contains(skinTestMethod(command))) {
                throw badRequest("MEDICATION_SKIN_TEST_METHOD_INVALID", "皮试方式不正确");
            }
            if (!Set.of("ORIGINAL_SOLUTION", "DILUTED_SOLUTION").contains(skinTestSolutionMode(command))) {
                throw badRequest("MEDICATION_SKIN_TEST_SOLUTION_MODE_INVALID", "皮试液配置方式不正确");
            }
            if (skinTestObservationMinutes(command) < 1 || skinTestObservationMinutes(command) > 120) {
                throw badRequest("MEDICATION_SKIN_TEST_OBSERVATION_INVALID", "皮试观察时长应为 1 至 120 分钟");
            }
            if (skinTestResultValidityHours(command) < 1 || skinTestResultValidityHours(command) > 8760) {
                throw badRequest("MEDICATION_SKIN_TEST_VALIDITY_INVALID", "皮试结果有效期应为 1 至 8760 小时");
            }
        }
        if (herbal && (command.strengthValue() != null || !blank(command.strengthUnit()))) {
            throw badRequest("MEDICATION_HERBAL_STRENGTH_INVALID", "草药饮片不维护制剂含量，请使用炮制规格和默认剂量");
        }
        if ((herbal || vaccine) && command.chronicDiseaseDrug()) {
            throw badRequest("MEDICATION_CHRONIC_TYPE_INVALID", "草药饮片和疫苗不维护慢病用药属性");
        }
        if (vaccine && !blank(command.defaultFrequency())) {
            throw badRequest("MEDICATION_VACCINE_FREQUENCY_INVALID", "疫苗接种程序应通过类型扩展属性维护，不能使用普通给药频次");
        }
    }

    private void requirePair(Object value, String unit, String code, String message) {
        if ((value == null) != blank(unit)) throw badRequest(code, message);
    }

    private boolean antimicrobialOutpatientAllowed(MedicationCommand command) {
        if (!command.antimicrobial()) return false;
        if (command.antimicrobialOutpatientAllowed() != null) return command.antimicrobialOutpatientAllowed();
        return !"SPECIAL".equals(command.antimicrobialLevel());
    }

    private boolean antimicrobialConsultationRequired(MedicationCommand command) {
        if (!command.antimicrobial()) return false;
        if (command.antimicrobialConsultationRequired() != null) return command.antimicrobialConsultationRequired();
        return "SPECIAL".equals(command.antimicrobialLevel());
    }

    private boolean antimicrobialEmergencyAllowed(MedicationCommand command) {
        return command.antimicrobial() && Boolean.TRUE.equals(command.antimicrobialEmergencyAllowed());
    }

    private Integer antimicrobialMaxDays(MedicationCommand command) {
        return command.antimicrobial() && antimicrobialOutpatientAllowed(command)
                ? command.antimicrobialMaxDays() : null;
    }

    private String skinTestMethod(MedicationCommand command) {
        return command.skinTestRequired() ? defaultIfBlank(command.skinTestMethod(), "INTRADERMAL") : null;
    }

    private String skinTestSolutionMode(MedicationCommand command) {
        return command.skinTestRequired() ? defaultIfBlank(command.skinTestSolutionMode(), "DILUTED_SOLUTION") : null;
    }

    private Integer skinTestObservationMinutes(MedicationCommand command) {
        return command.skinTestRequired()
                ? (command.skinTestObservationMinutes() == null ? 20 : command.skinTestObservationMinutes()) : null;
    }

    private Integer skinTestResultValidityHours(MedicationCommand command) {
        return command.skinTestRequired()
                ? (command.skinTestResultValidityHours() == null ? 24 : command.skinTestResultValidityHours()) : null;
    }

    private String skinTestInstructions(MedicationCommand command) {
        return command.skinTestRequired() ? clean(command.skinTestInstructions()) : null;
    }

    private String defaultIfBlank(String value, String defaultValue) {
        return blank(value) ? defaultValue : value.trim().toUpperCase(Locale.ROOT);
    }

    private OrderFrequencyDirectory.FrequencySnapshot resolveMedicationFrequency(ExecutionContext context,
            String code, Long organizationId) {
        if (blank(code)) return null;
        Long org = organizationId == null ? context.organizationId() : organizationId;
        return orderFrequencyDirectory.requireActive(context.tenantId(), code, org, context.departmentId(),
                "OUTPATIENT", "MEDICATION", LocalDate.now());
    }

    private MedicationRouteDirectory.RouteSnapshot resolveMedicationRoute(ExecutionContext context, String code) {
        if (blank(code)) return null;
        return medicationRouteDirectory.requireActive(context.tenantId(), code, "MASTER_DATA", LocalDate.now());
    }

    private void requireCode(String dictionary, String code) {
        if (blank(code) || dictionaryDirectory.resolveActiveItems(current().tenantId(), dictionary).stream()
                .noneMatch(value -> value.code().equals(code))) {
            throw badRequest("MASTER_DATA_CODE_INVALID", "代码 " + code + " 不属于字典 " + dictionary);
        }
    }

    private void requireCatalogItem(Long tenantId, Long id) {
        if (serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").isEmpty()
                && productRepository.findByIdAndTenantIdAndItemType(id, tenantId, "MED_PRODUCT").isEmpty()
                && supplyRepository.findByIdAndTenantId(id, tenantId).isEmpty()) {
            throw notFound("CATALOG_ITEM_NOT_FOUND", "未找到目录项目");
        }
    }

    private ServiceCatalogItem requireService(Long tenantId, Long id) {
        return serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE")
                .orElseThrow(() -> notFound("SERVICE_NOT_FOUND", "未找到诊疗项目"));
    }

    private Medication requireMedication(Long tenantId, Long id) {
        return medicationRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到药品知识"));
    }

    private MedicationProduct requireProduct(Long tenantId, Long id) {
        return productRepository.findByIdAndTenantIdAndItemType(id, tenantId, "MED_PRODUCT")
                .orElseThrow(() -> notFound("MEDICATION_PRODUCT_NOT_FOUND", "未找到药品产品"));
    }

    private void requireRevision(long current, long expected, String code, String message) {
        if (current != expected) throw conflict(code, message);
    }

    private boolean matches(String query, String... values) {
        if (blank(query)) return true;
        String normalized = query.trim().toLowerCase(Locale.ROOT);
        for (String value : values) {
            if (value != null && value.toLowerCase(Locale.ROOT).contains(normalized)) return true;
        }
        return false;
    }

    private boolean matchesServiceView(String query, ServiceView value) {
        OrganizationAdoptionView adoption = value.organizationAdoption();
        return matches(query, value.code(), value.name(), value.serviceSubtype(), value.specimenType(),
                value.examinationType(), value.accountingCategory(),
                adoption == null ? null : adoption.localCode(), adoption == null ? null : adoption.localName());
    }

    private boolean blank(String value) { return value == null || value.isBlank(); }
    private String clean(String value) { return blank(value) ? null : value.trim(); }
    private ExecutionContext current() { return contextProvider.requireCurrent(); }
}
