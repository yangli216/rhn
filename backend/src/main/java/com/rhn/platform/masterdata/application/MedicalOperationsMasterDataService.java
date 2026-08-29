package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.DictionaryItemReference;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.api.MasterDataItemTypes;
import com.rhn.platform.masterdata.api.MedicalOperationsCommands.*;
import com.rhn.platform.masterdata.api.MedicalOperationsViews.*;
import com.rhn.platform.masterdata.domain.*;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicalOperationsMasterDataService {
    private static final Set<String> STATUSES = Set.of("ACTIVE", "INACTIVE");
    private final ServiceCatalogItemRepository serviceRepository;
    private final LaboratoryServiceRepository laboratoryRepository;
    private final LaboratoryServiceSpecimenRepository specimenRepository;
    private final ExaminationServiceRepository examinationRepository;
    private final ServiceVariantRepository variantRepository;
    private final ExaminationAttachmentItemRepository attachmentRepository;
    private final SupplyItemRepository supplyRepository;
    private final ManufacturerRepository manufacturerRepository;
    private final ItemAttributeSubjectRepository attributeSubjectRepository;
    private final ItemGroupRepository groupRepository;
    private final ItemGroupMemberRepository memberRepository;
    private final UnitDefinitionRepository unitRepository;
    private final UnitConversionRepository conversionRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final ExecutionContextProvider contextProvider;
    private final EntityManager entityManager;

    public MedicalOperationsMasterDataService(ServiceCatalogItemRepository serviceRepository,
            LaboratoryServiceRepository laboratoryRepository,
            LaboratoryServiceSpecimenRepository specimenRepository,
            ExaminationServiceRepository examinationRepository,
            ServiceVariantRepository variantRepository,
            ExaminationAttachmentItemRepository attachmentRepository,
            SupplyItemRepository supplyRepository,
            ManufacturerRepository manufacturerRepository,
            ItemAttributeSubjectRepository attributeSubjectRepository,
            ItemGroupRepository groupRepository, ItemGroupMemberRepository memberRepository,
            UnitDefinitionRepository unitRepository, UnitConversionRepository conversionRepository,
            DictionaryDirectory dictionaryDirectory, OrganizationDirectory organizationDirectory,
            ExecutionContextProvider contextProvider, EntityManager entityManager) {
        this.serviceRepository = serviceRepository;
        this.laboratoryRepository = laboratoryRepository;
        this.specimenRepository = specimenRepository;
        this.examinationRepository = examinationRepository;
        this.variantRepository = variantRepository;
        this.attachmentRepository = attachmentRepository;
        this.supplyRepository = supplyRepository;
        this.manufacturerRepository = manufacturerRepository;
        this.attributeSubjectRepository = attributeSubjectRepository;
        this.groupRepository = groupRepository;
        this.memberRepository = memberRepository;
        this.unitRepository = unitRepository;
        this.conversionRepository = conversionRepository;
        this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory;
        this.contextProvider = contextProvider;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public ClinicalConfiguration clinicalConfiguration(Long serviceId) {
        ExecutionContext context = current();
        ServiceCatalogItem service = requireService(context.tenantId(), serviceId);
        List<DictionaryOption> specimenOptions = options(context.tenantId(), MasterDataDictionaryCodes.SPECIMEN_TYPE);
        List<DictionaryOption> containerOptions = options(context.tenantId(), MasterDataDictionaryCodes.SPECIMEN_CONTAINER);
        Map<Long, DictionaryOption> specimenMap = specimenOptions.stream().collect(Collectors.toMap(DictionaryOption::id, Function.identity()));
        Map<Long, DictionaryOption> containerMap = containerOptions.stream().collect(Collectors.toMap(DictionaryOption::id, Function.identity()));
        LaboratoryService laboratory = laboratoryRepository.findByTenantIdAndCatalogItemId(context.tenantId(), serviceId).orElse(null);
        ExaminationService examination = examinationRepository.findByTenantIdAndCatalogItemId(context.tenantId(), serviceId).orElse(null);
        return new ClinicalConfiguration(service.id(), service.code(), service.name(), service.serviceType(),
                laboratory == null ? null : laboratoryView(laboratory, specimenMap, containerMap),
                examination == null ? null : examinationView(examination), specimenOptions, containerOptions);
    }

    @Transactional
    public ClinicalConfiguration updateLaboratoryProfile(Long serviceId, long expectedRevision,
            LaboratoryProfileCommand command) {
        ExecutionContext context = current();
        requireServiceType(context.tenantId(), serviceId, "LABORATORY");
        LaboratoryService value = laboratoryRepository.findByTenantIdAndCatalogItemId(context.tenantId(), serviceId)
                .orElseThrow(() -> notFound("LAB_PROFILE_NOT_FOUND", "未找到检验项目配置"));
        requireRevision(value.revision(), expectedRevision, "LAB_PROFILE_REVISION_STALE");
        if (text(command.laboratoryMethod()) != null) requireDictionaryCode(context.tenantId(), MasterDataDictionaryCodes.LAB_METHOD, command.laboratoryMethod());
        if (text(command.reportDurationUnit()) != null) {
            UnitDefinition durationUnit = requireUnit(context.tenantId(), command.reportDurationUnit(), true);
            if (!"TIME".equals(durationUnit.dimension())) {
                throw badRequest("REPORT_DURATION_UNIT_INVALID", "报告时长必须使用时间维度单位");
            }
        }
        value.update(expectedRevision, text(command.laboratoryMethod()), command.reportDuration(),
                text(command.reportDurationUnit()), command.fastingRequired(), command.pointOfCare(),
                text(command.collectionDescription()), context.subjectId());
        laboratoryRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration createSpecimen(Long serviceId, SpecimenCommand command) {
        ExecutionContext context = current();
        requireServiceType(context.tenantId(), serviceId, "LABORATORY");
        validateSpecimen(context.tenantId(), serviceId, null, command);
        specimenRepository.save(new LaboratoryServiceSpecimen(context.tenantId(), serviceId,
                command.specimenItemId(), command.containerItemId(), command.minimumQuantity(),
                text(command.minimumQuantityUnit()), command.defaultSpecimen(), command.requiredSpecimen(),
                command.sortOrder(), text(command.collectionDescription()), requireStatus(command.status()),
                text(command.tubeGroupCode()), command.tubeSharingMode(), command.baseTubeCount(),
                command.maxTestsPerTube(), command.tubeChargeMode(), command.tubeChargeItemId(),
                command.includedTubeCount(), command.tubeChargeQuantity(), context.subjectId()));
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration updateSpecimen(Long serviceId, Long specimenId, long expectedRevision,
            SpecimenCommand command) {
        ExecutionContext context = current();
        LaboratoryServiceSpecimen value = specimenRepository
                .findByTenantIdAndCatalogItemIdAndId(context.tenantId(), serviceId, specimenId)
                .orElseThrow(() -> notFound("LAB_SPECIMEN_NOT_FOUND", "未找到检验标本配置"));
        requireRevision(value.revision(), expectedRevision, "LAB_SPECIMEN_REVISION_STALE");
        validateSpecimen(context.tenantId(), serviceId, specimenId, command);
        value.update(expectedRevision, command.specimenItemId(), command.containerItemId(),
                command.minimumQuantity(), text(command.minimumQuantityUnit()), command.defaultSpecimen(),
                command.requiredSpecimen(), command.sortOrder(), text(command.collectionDescription()),
                requireStatus(command.status()), text(command.tubeGroupCode()), command.tubeSharingMode(),
                command.baseTubeCount(), command.maxTestsPerTube(), command.tubeChargeMode(),
                command.tubeChargeItemId(), command.includedTubeCount(), command.tubeChargeQuantity(),
                context.subjectId());
        specimenRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration changeSpecimenStatus(Long serviceId, Long specimenId,
            long expectedRevision, String status) {
        ExecutionContext context = current();
        LaboratoryServiceSpecimen value = specimenRepository
                .findByTenantIdAndCatalogItemIdAndId(context.tenantId(), serviceId, specimenId)
                .orElseThrow(() -> notFound("LAB_SPECIMEN_NOT_FOUND", "未找到检验标本配置"));
        requireRevision(value.revision(), expectedRevision, "LAB_SPECIMEN_REVISION_STALE");
        String nextStatus = requireStatus(status);
        validateSpecimen(context.tenantId(), serviceId, specimenId, new SpecimenCommand(
                value.specimenItemId(), value.containerItemId(), value.minimumQuantity(),
                value.minimumQuantityUnit(), value.defaultSpecimen(), value.requiredSpecimen(),
                value.sortOrder(), value.collectionDescription(), nextStatus, value.tubeGroupCode(),
                value.tubeSharingMode(), value.baseTubeCount(), value.maxTestsPerTube(),
                value.tubeChargeMode(), value.tubeChargeItemId(), value.includedTubeCount(),
                value.tubeChargeQuantity()));
        value.changeStatus(expectedRevision, nextStatus, context.subjectId());
        specimenRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration updateExaminationProfile(Long serviceId, long expectedRevision,
            ExaminationProfileCommand command) {
        ExecutionContext context = current();
        requireServiceType(context.tenantId(), serviceId, "EXAMINATION");
        ExaminationService value = examinationRepository.findByTenantIdAndCatalogItemId(context.tenantId(), serviceId)
                .orElseThrow(() -> notFound("EXAM_PROFILE_NOT_FOUND", "未找到检查项目配置"));
        requireRevision(value.revision(), expectedRevision, "EXAM_PROFILE_REVISION_STALE");
        if (text(command.examinationType()) != null) requireDictionaryCode(context.tenantId(), MasterDataDictionaryCodes.EXAM_TYPE, command.examinationType());
        String pricingMode = text(command.sitePricingMode()) == null ? value.sitePricingMode() : command.sitePricingMode();
        int includedSiteCount = command.includedSiteCount() == null ? value.includedSiteCount() : command.includedSiteCount();
        BigDecimal additionalSitePrice = "BASE_PLUS_FIXED".equals(pricingMode)
                ? command.additionalSitePrice() == null ? value.additionalSitePrice() : command.additionalSitePrice()
                : null;
        Long additionalSiteItemId = "BASE_PLUS_ITEM".equals(pricingMode)
                ? command.additionalSiteItemId() == null ? value.additionalSiteItemId() : command.additionalSiteItemId()
                : null;
        BigDecimal additionalSiteQuantity = command.additionalSiteQuantity() == null
                ? value.additionalSiteQuantity() : command.additionalSiteQuantity();
        Integer maxChargeableSiteCount = command.maxChargeableSiteCount() == null
                ? command.maxBodySiteCount() : command.maxChargeableSiteCount();
        validateSitePricing(context.tenantId(), serviceId, command.bodySiteRequired(), command.multiBodySite(),
                command.maxBodySiteCount(), pricingMode, includedSiteCount, additionalSitePrice,
                additionalSiteItemId, additionalSiteQuantity, maxChargeableSiteCount);
        value.update(expectedRevision, text(command.examinationType()), command.bodySiteRequired(),
                command.multiBodySite(), command.maxBodySiteCount(), text(command.preparationDescription()),
                pricingMode, includedSiteCount, additionalSitePrice, additionalSiteItemId,
                additionalSiteQuantity, maxChargeableSiteCount, context.subjectId());
        examinationRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration createVariant(Long serviceId, ExaminationVariantCommand command) {
        ExecutionContext context = current();
        requireServiceType(context.tenantId(), serviceId, "EXAMINATION");
        validateVariant(context.tenantId(), serviceId, null, command);
        ServiceVariant value = variantRepository.save(new ServiceVariant(context.tenantId(), serviceId,
                command.bodySiteConceptId(), command.code(), command.name(), text(command.methodType()),
                command.bodySiteRequired(), text(command.mutualRecognitionCode()), command.sortOrder(),
                requireStatus(command.status()), context.subjectId()));
        attributeSubjectRepository.save(ItemAttributeSubject.serviceVariant(context.tenantId(), value.id(), context.subjectId()));
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration updateVariant(Long serviceId, Long variantId, long expectedRevision,
            ExaminationVariantCommand command) {
        ExecutionContext context = current();
        ServiceVariant value = variantRepository.findByTenantIdAndCatalogItemIdAndId(context.tenantId(), serviceId, variantId)
                .orElseThrow(() -> notFound("EXAM_VARIANT_NOT_FOUND", "未找到检查部位方式"));
        requireRevision(value.revision(), expectedRevision, "EXAM_VARIANT_REVISION_STALE");
        validateVariant(context.tenantId(), serviceId, variantId, command);
        value.update(expectedRevision, command.bodySiteConceptId(), command.code(), command.name(),
                text(command.methodType()), command.bodySiteRequired(), text(command.mutualRecognitionCode()),
                command.sortOrder(), requireStatus(command.status()), context.subjectId());
        variantRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration createAttachment(Long serviceId, ExaminationAttachmentCommand command) {
        ExecutionContext context = current();
        requireServiceType(context.tenantId(), serviceId, "EXAMINATION");
        validateAttachment(context.tenantId(), serviceId, null, command);
        attachmentRepository.save(new ExaminationAttachmentItem(context.tenantId(), serviceId,
                command.attachmentCatalogItemId(), command.triggerType(), command.quantityBasis(),
                command.quantity(), command.requiredAttachment(), command.separatelyChargeable(),
                command.sortOrder(), text(command.description()), requireStatus(command.status()), context.subjectId()));
        return clinicalConfiguration(serviceId);
    }

    @Transactional
    public ClinicalConfiguration updateAttachment(Long serviceId, Long attachmentId, long expectedRevision,
            ExaminationAttachmentCommand command) {
        ExecutionContext context = current();
        ExaminationAttachmentItem value = attachmentRepository
                .findByTenantIdAndCatalogItemIdAndId(context.tenantId(), serviceId, attachmentId)
                .orElseThrow(() -> notFound("EXAM_ATTACHMENT_NOT_FOUND", "未找到检查附件项目"));
        requireRevision(value.revision(), expectedRevision, "EXAM_ATTACHMENT_REVISION_STALE");
        validateAttachment(context.tenantId(), serviceId, attachmentId, command);
        value.update(expectedRevision, command.attachmentCatalogItemId(), command.triggerType(),
                command.quantityBasis(), command.quantity(), command.requiredAttachment(),
                command.separatelyChargeable(), command.sortOrder(), text(command.description()),
                requireStatus(command.status()), context.subjectId());
        attachmentRepository.save(value);
        return clinicalConfiguration(serviceId);
    }

    @Transactional(readOnly = true)
    public ExaminationChargePlan examinationChargePlan(Long serviceId, List<String> bodySiteCodes,
            List<Long> selectedAttachmentIds) {
        ExecutionContext context = current();
        ServiceCatalogItem service = requireServiceType(context.tenantId(), serviceId, "EXAMINATION");
        ExaminationService profile = examinationRepository
                .findByTenantIdAndCatalogItemId(context.tenantId(), serviceId)
                .orElseThrow(() -> notFound("EXAM_PROFILE_NOT_FOUND", "未找到检查项目配置"));
        List<String> sites = (bodySiteCodes == null ? List.<String>of() : bodySiteCodes).stream()
                .map(this::text).filter(Objects::nonNull).distinct().toList();
        int siteCount = sites.size();
        if (profile.bodySiteRequired() && siteCount == 0) {
            throw badRequest("EXAM_BODY_SITE_REQUIRED", "该检查项目必须选择检查部位");
        }
        if (profile.maxBodySiteCount() != null && siteCount > profile.maxBodySiteCount()) {
            throw badRequest("EXAM_BODY_SITE_LIMIT_EXCEEDED", "所选检查部位数超过项目允许上限");
        }
        int effectiveSiteCount = Math.max(1, siteCount);
        if (profile.maxChargeableSiteCount() != null) {
            effectiveSiteCount = Math.min(effectiveSiteCount, profile.maxChargeableSiteCount());
        }
        int extraSiteCount = Math.max(0, effectiveSiteCount - profile.includedSiteCount());
        List<DiagnosticChargeLine> lines = new ArrayList<>();
        BigDecimal baseQuantity = "PER_SITE".equals(profile.sitePricingMode())
                ? BigDecimal.valueOf(effectiveSiteCount) : BigDecimal.ONE;
        lines.add(chargeLine(service, baseQuantity, "BASE_SERVICE", true, null, "检查主项目"));
        if (extraSiteCount > 0 && "BASE_PLUS_FIXED".equals(profile.sitePricingMode())) {
            BigDecimal amount = profile.additionalSitePrice().multiply(BigDecimal.valueOf(extraSiteCount));
            lines.add(chargeLine(service, BigDecimal.valueOf(extraSiteCount), "MULTI_SITE_FIXED", true,
                    amount, "超出包含部位数的固定加收金额"));
        } else if (extraSiteCount > 0 && "BASE_PLUS_ITEM".equals(profile.sitePricingMode())) {
            CatalogReference item = requireChargeableCatalogItem(context.tenantId(), profile.additionalSiteItemId());
            lines.add(chargeLine(item, profile.additionalSiteQuantity().multiply(BigDecimal.valueOf(extraSiteCount)),
                    "MULTI_SITE_ITEM", true, null, "多部位加收项目"));
        }

        Set<Long> selected = new HashSet<>(selectedAttachmentIds == null ? List.of() : selectedAttachmentIds);
        List<ExaminationAttachmentItem> attachments = attachmentRepository
                .findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(context.tenantId(), serviceId).stream()
                .filter(v -> "ACTIVE".equals(v.status())).toList();
        Set<Long> validAttachmentIds = attachments.stream().map(ExaminationAttachmentItem::id).collect(Collectors.toSet());
        if (!validAttachmentIds.containsAll(selected)) {
            throw badRequest("EXAM_ATTACHMENT_SELECTION_INVALID", "所选附件项目不存在、已停用或不属于当前检查项目");
        }
        for (ExaminationAttachmentItem attachment : attachments) {
            boolean applies = "ALWAYS".equals(attachment.triggerType())
                    || "MULTI_SITE".equals(attachment.triggerType()) && siteCount > 1
                    || "OPTIONAL".equals(attachment.triggerType()) && selected.contains(attachment.id());
            if (!applies) continue;
            BigDecimal multiplier = switch (attachment.quantityBasis()) {
                case "PER_SITE" -> BigDecimal.valueOf(effectiveSiteCount);
                case "PER_EXTRA_SITE" -> BigDecimal.valueOf(extraSiteCount);
                default -> BigDecimal.ONE;
            };
            BigDecimal quantity = attachment.quantity().multiply(multiplier);
            if (quantity.signum() == 0) continue;
            CatalogReference item = requireCatalogItem(context.tenantId(), attachment.attachmentCatalogItemId());
            lines.add(chargeLine(item, quantity, "ATTACHMENT", attachment.separatelyChargeable(), null,
                    attachment.description()));
        }
        return new ExaminationChargePlan(serviceId, siteCount, profile.sitePricingMode(),
                profile.includedSiteCount(), extraSiteCount, List.copyOf(lines));
    }

    @Transactional(readOnly = true)
    public LaboratoryTubePlan laboratoryTubePlan(List<LaboratoryOrderItemCommand> items) {
        ExecutionContext context = current();
        if (items == null || items.isEmpty()) throw badRequest("LAB_ORDER_ITEMS_REQUIRED", "至少需要一个检验项目");
        Map<String, TubeAccumulator> groups = new LinkedHashMap<>();
        int index = 0;
        for (LaboratoryOrderItemCommand order : items) {
            ServiceCatalogItem service = requireServiceType(context.tenantId(), order.serviceId(), "LABORATORY");
            if (order.quantity() <= 0) throw badRequest("LAB_ORDER_QUANTITY_INVALID", "检验项目数量必须大于0");
            LaboratoryServiceSpecimen specimen = resolveSpecimen(context.tenantId(), order);
            String groupCode = text(specimen.tubeGroupCode()) == null
                    ? "ITEM:" + service.id() : specimen.tubeGroupCode();
            String key = "SEPARATE".equals(specimen.tubeSharingMode())
                    ? groupCode + ":" + specimen.id() + ":" + index++ : groupCode;
            TubeAccumulator accumulator = groups.get(key);
            if (accumulator == null) {
                accumulator = new TubeAccumulator(groupCode, specimen);
                groups.put(key, accumulator);
            } else if (!compatibleTubeRule(accumulator.specimen, specimen)) {
                throw conflict("LAB_TUBE_GROUP_RULE_CONFLICT", "同一分管编码的容器、分管方式或试管加收规则不一致");
            }
            accumulator.add(service.id(), order.quantity(), specimen.baseTubeCount());
        }

        Map<Long, DictionaryOption> specimenOptions = options(context.tenantId(), MasterDataDictionaryCodes.SPECIMEN_TYPE)
                .stream().collect(Collectors.toMap(DictionaryOption::id, Function.identity()));
        Map<Long, DictionaryOption> containerOptions = options(context.tenantId(), MasterDataDictionaryCodes.SPECIMEN_CONTAINER)
                .stream().collect(Collectors.toMap(DictionaryOption::id, Function.identity()));
        List<LaboratoryTubeGroup> resultGroups = new ArrayList<>();
        List<DiagnosticChargeLine> allCharges = new ArrayList<>();
        for (TubeAccumulator accumulator : groups.values()) {
            LaboratoryServiceSpecimen specimen = accumulator.specimen;
            int tubeCount = accumulator.tubeCount();
            List<DiagnosticChargeLine> charges = new ArrayList<>();
            int chargeableTubes = switch (specimen.tubeChargeMode()) {
                case "PER_TUBE" -> tubeCount;
                case "EXCESS_TUBE" -> Math.max(0, tubeCount - specimen.includedTubeCount());
                default -> 0;
            };
            if (chargeableTubes > 0) {
                CatalogReference item = requireChargeableCatalogItem(context.tenantId(), specimen.tubeChargeItemId());
                charges.add(chargeLine(item, specimen.tubeChargeQuantity().multiply(BigDecimal.valueOf(chargeableTubes)),
                        "TUBE_SURCHARGE", true, null, "采血管/容器加收"));
            }
            allCharges.addAll(charges);
            DictionaryOption specimenOption = specimenOptions.get(specimen.specimenItemId());
            DictionaryOption containerOption = containerOptions.get(specimen.containerItemId());
            resultGroups.add(new LaboratoryTubeGroup(accumulator.groupCode, specimen.specimenItemId(),
                    specimenOption == null ? null : specimenOption.code(), specimenOption == null ? null : specimenOption.name(),
                    specimen.containerItemId(), containerOption == null ? null : containerOption.code(),
                    containerOption == null ? null : containerOption.name(), specimen.tubeSharingMode(), tubeCount,
                    List.copyOf(accumulator.serviceIds), List.copyOf(charges)));
        }
        return new LaboratoryTubePlan(List.copyOf(resultGroups), List.copyOf(allCharges));
    }

    @Transactional(readOnly = true)
    public List<SupplyView> supplies(String query, String status, String supplyType) {
        ExecutionContext context = current();
        return supplyRepository.findByTenantIdOrderByName(context.tenantId()).stream()
                .filter(v -> text(status) == null || status.equals(v.status()))
                .filter(v -> text(supplyType) == null || supplyType(v).equals(supplyType))
                .filter(v -> matches(query, v.code(), v.name(), v.udiDi(), v.genericCode(), v.genericName(), v.modelName(), v.registrationCode()))
                .map(v -> supplyView(context.tenantId(), v)).toList();
    }

    @Transactional
    public SupplyView createSupply(SupplyCommand command) {
        ExecutionContext context = current();
        validateSupply(context.tenantId(), null, command);
        SupplyItem value = new SupplyItem(context.tenantId(), context.subjectId(),
                MasterDataItemTypes.forSupply(command.supplyType()), command.code(), command.name(), command.unitCode(),
                command.orderable(), command.chargeable(), command.stocked(), requireStatus(command.status()),
                command.validFrom(), command.validTo(), text(command.udiDi()), text(command.genericCode()),
                text(command.genericName()), text(command.modelName()), text(command.specification()),
                text(command.materialType()), text(command.deviceClass()), command.highValue(), command.implant(),
                command.intervention(), command.sterile(), command.singleUse(), text(command.registrationCode()),
                text(command.registrationName()), text(command.registrantName()), command.registrationFrom(),
                command.registrationTo(), command.manufacturerId(), text(command.structureDescription()),
                text(command.scopeDescription()), text(command.instruction()));
        // Assigned identifiers combined with a secondary table require persist here;
        // Repository.save would use merge and try to hydrate a not-yet-existing secondary row.
        entityManager.persist(value);
        entityManager.flush();
        attributeSubjectRepository.save(ItemAttributeSubject.catalogItem(context.tenantId(), value.id(), context.subjectId()));
        return supplyView(context.tenantId(), value);
    }

    @Transactional
    public SupplyView updateSupply(Long id, long expectedRevision, SupplyCommand command) {
        ExecutionContext context = current();
        SupplyItem value = requireSupply(context.tenantId(), id);
        requireRevision(value.revision(), expectedRevision, "SUPPLY_REVISION_STALE");
        validateSupply(context.tenantId(), id, command);
        value.update(expectedRevision, context.subjectId(), MasterDataItemTypes.forSupply(command.supplyType()),
                command.name(), command.unitCode(), command.orderable(), command.chargeable(), command.stocked(),
                requireStatus(command.status()), command.validFrom(), command.validTo(), text(command.udiDi()),
                text(command.genericCode()), text(command.genericName()), text(command.modelName()),
                text(command.specification()), text(command.materialType()), text(command.deviceClass()),
                command.highValue(), command.implant(), command.intervention(), command.sterile(), command.singleUse(),
                text(command.registrationCode()), text(command.registrationName()), text(command.registrantName()),
                command.registrationFrom(), command.registrationTo(), command.manufacturerId(),
                text(command.structureDescription()), text(command.scopeDescription()), text(command.instruction()));
        return supplyView(context.tenantId(), supplyRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<ItemGroupView> groups(String query, String groupType, String status) {
        ExecutionContext context = current();
        return groupRepository.findByTenantIdOrderByName(context.tenantId()).stream()
                .filter(v -> text(groupType) == null || groupType.equals(v.groupType()))
                .filter(v -> text(status) == null || status.equals(v.status()))
                .filter(v -> matches(query, v.code(), v.name(), v.usageType()))
                .map(v -> groupView(context.tenantId(), v)).toList();
    }

    @Transactional
    public ItemGroupView createGroup(ItemGroupCommand command) {
        ExecutionContext context = current();
        validateGroup(context.tenantId(), null, command);
        ItemGroup group = groupRepository.save(new ItemGroup(context.tenantId(), context.subjectId(),
                command.organizationId(), command.executionDepartmentId(), command.code(), command.name(),
                command.groupType(), command.usageType(), command.pointOfCare(), requireStatus(command.status()),
                command.validFrom(), command.validTo()));
        saveMembers(context.tenantId(), group, command.members());
        return groupView(context.tenantId(), group);
    }

    @Transactional
    public ItemGroupView updateGroup(Long id, long expectedRevision, ItemGroupCommand command) {
        ExecutionContext context = current();
        ItemGroup group = requireGroup(context.tenantId(), id);
        requireRevision(group.revision(), expectedRevision, "ITEM_GROUP_REVISION_STALE");
        validateGroup(context.tenantId(), id, command);
        group.update(expectedRevision, context.subjectId(), command.organizationId(), command.executionDepartmentId(),
                command.name(), command.groupType(), command.usageType(), command.pointOfCare(),
                requireStatus(command.status()), command.validFrom(), command.validTo());
        groupRepository.save(group);
        memberRepository.deleteByTenantIdAndItemGroupId(context.tenantId(), id);
        memberRepository.flush();
        saveMembers(context.tenantId(), group, command.members());
        return groupView(context.tenantId(), group);
    }

    @Transactional(readOnly = true)
    public List<UnitView> units(String dimension, String status) {
        Long tenantId = current().tenantId();
        return unitRepository.findByTenantIdOrderByDimensionAscNameAsc(tenantId).stream()
                .filter(v -> text(dimension) == null || dimension.equals(v.dimension()))
                .filter(v -> text(status) == null || status.equals(v.status())).map(this::unitView).toList();
    }

    @Transactional
    public UnitView createUnit(UnitCommand command) {
        ExecutionContext context = current();
        if (unitRepository.existsByTenantIdAndCode(context.tenantId(), command.code().trim().toUpperCase(Locale.ROOT)))
            throw conflict("UNIT_CODE_DUPLICATE", "当前租户已存在相同单位编码");
        UnitDefinition value = new UnitDefinition(context.tenantId(), context.subjectId(),
                command.code().trim().toUpperCase(Locale.ROOT), command.name(), command.symbol(),
                command.dimension(), command.decimalScale(), requireStatus(command.status()));
        return unitView(unitRepository.save(value));
    }

    @Transactional
    public UnitView updateUnit(Long id, long expectedRevision, UnitCommand command) {
        ExecutionContext context = current();
        UnitDefinition value = requireUnit(context.tenantId(), id);
        requireRevision(value.revision(), expectedRevision, "UNIT_REVISION_STALE");
        if (!value.code().equalsIgnoreCase(command.code().trim())) {
            throw badRequest("UNIT_CODE_IMMUTABLE", "单位编码创建后不允许修改");
        }
        validateUnitChange(context.tenantId(), value, command);
        value.update(expectedRevision, context.subjectId(), command.name(), command.symbol(),
                command.dimension(), command.decimalScale(), requireStatus(command.status()));
        return unitView(unitRepository.save(value));
    }

    @Transactional(readOnly = true)
    public List<ConversionView> conversions(Long catalogItemId) {
        Long tenantId = current().tenantId();
        Map<Long, UnitDefinition> units = unitRepository.findByTenantIdOrderByDimensionAscNameAsc(tenantId).stream()
                .collect(Collectors.toMap(UnitDefinition::id, Function.identity()));
        return conversionRepository.findByTenantIdOrderByScopeCodeAscValidFromDesc(tenantId).stream()
                .filter(v -> catalogItemId == null || Objects.equals(v.catalogItemId(), catalogItemId))
                .map(v -> conversionView(v, units)).toList();
    }

    @Transactional
    public ConversionView createConversion(ConversionCommand command) {
        ExecutionContext context = current();
        UnitDefinition from = requireUnit(context.tenantId(), command.fromUnitCode(), true);
        UnitDefinition to = requireUnit(context.tenantId(), command.toUnitCode(), true);
        validateConversion(context.tenantId(), null, command, from, to);
        UnitConversion value = conversionRepository.save(new UnitConversion(context.tenantId(), context.subjectId(),
                command.catalogItemId(), from.id(), to.id(), command.factor(), command.offset(), command.validFrom(),
                command.validTo(), requireStatus(command.status())));
        return conversionView(value, Map.of(from.id(), from, to.id(), to));
    }

    @Transactional
    public ConversionView updateConversion(Long id, long expectedRevision, ConversionCommand command) {
        ExecutionContext context = current();
        UnitConversion value = conversionRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("UNIT_CONVERSION_NOT_FOUND", "未找到单位换算规则"));
        requireRevision(value.revision(), expectedRevision, "UNIT_CONVERSION_REVISION_STALE");
        if (!Objects.equals(value.catalogItemId(), command.catalogItemId())) throw badRequest("UNIT_CONVERSION_SCOPE_IMMUTABLE", "换算范围不允许修改");
        UnitDefinition from = requireUnit(context.tenantId(), command.fromUnitCode(), true);
        UnitDefinition to = requireUnit(context.tenantId(), command.toUnitCode(), true);
        if (!value.fromUnitId().equals(from.id()) || !value.toUnitId().equals(to.id()))
            throw badRequest("UNIT_CONVERSION_DIRECTION_IMMUTABLE", "换算方向不允许修改");
        validateConversion(context.tenantId(), id, command, from, to);
        value.update(expectedRevision, context.subjectId(), command.factor(), command.offset(), command.validFrom(),
                command.validTo(), requireStatus(command.status()));
        return conversionView(conversionRepository.save(value), Map.of(from.id(), from, to.id(), to));
    }

    @Transactional(readOnly = true)
    public ConversionResult convert(BigDecimal quantity, String fromCode, String toCode,
            Long catalogItemId, LocalDate date) {
        if (quantity == null) throw badRequest("QUANTITY_REQUIRED", "换算数量不能为空");
        ExecutionContext context = current();
        LocalDate effectiveDate = date == null ? LocalDate.now() : date;
        UnitDefinition from = requireUnit(context.tenantId(), fromCode, true);
        UnitDefinition to = requireUnit(context.tenantId(), toCode, true);
        if (!from.dimension().equals(to.dimension())) throw badRequest("UNIT_DIMENSION_MISMATCH", "不同计量维度不能换算");
        if (from.id().equals(to.id())) return new ConversionResult(quantity, from.code(),
                quantity.setScale(to.decimalScale(), RoundingMode.HALF_UP), to.code(), catalogItemId, effectiveDate, List.of(from.code()));
        List<UnitConversion> all = conversionRepository.findByTenantIdOrderByScopeCodeAscValidFromDesc(context.tenantId()).stream()
                .filter(v -> v.effective(effectiveDate))
                .filter(v -> v.catalogItemId() == null || Objects.equals(v.catalogItemId(), catalogItemId)).toList();
        List<UnitConversion> selected = preferItemRules(all, catalogItemId);
        Map<Long, UnitDefinition> units = unitRepository.findByTenantIdOrderByDimensionAscNameAsc(context.tenantId()).stream()
                .collect(Collectors.toMap(UnitDefinition::id, Function.identity()));
        ConversionPath path = findPath(from.id(), to.id(), selected);
        if (path == null) throw badRequest("UNIT_CONVERSION_PATH_NOT_FOUND", "未找到可用的单位换算路径");
        BigDecimal result = quantity.multiply(path.factor(), MathContext.DECIMAL128).add(path.offset(), MathContext.DECIMAL128)
                .setScale(to.decimalScale(), RoundingMode.HALF_UP);
        return new ConversionResult(quantity, from.code(), result, to.code(), catalogItemId, effectiveDate,
                path.unitIds().stream().map(id -> units.get(id).code()).toList());
    }

    private LaboratoryProfile laboratoryView(LaboratoryService value, Map<Long, DictionaryOption> specimenMap,
            Map<Long, DictionaryOption> containerMap) {
        List<SpecimenConfiguration> rows = specimenRepository
                .findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(value.tenantId(), value.catalogItemId()).stream()
                .map(v -> {
                    DictionaryOption s = specimenMap.get(v.specimenItemId());
                    DictionaryOption c = containerMap.get(v.containerItemId());
                    CatalogReference chargeItem = v.tubeChargeItemId() == null ? null
                            : requireCatalogItem(v.tenantId(), v.tubeChargeItemId());
                    return new SpecimenConfiguration(v.id(), v.revision(), v.specimenItemId(), s == null ? null : s.code(),
                            s == null ? null : s.name(), v.containerItemId(), c == null ? null : c.code(),
                            c == null ? null : c.name(), v.minimumQuantity(), v.minimumQuantityUnit(),
                            v.defaultSpecimen(), v.requiredSpecimen(), v.sortOrder(), v.collectionDescription(), v.status(),
                            v.tubeGroupCode(), v.tubeSharingMode(), v.baseTubeCount(), v.maxTestsPerTube(),
                            v.tubeChargeMode(), v.tubeChargeItemId(), chargeItem == null ? null : chargeItem.code(),
                            chargeItem == null ? null : chargeItem.name(), v.includedTubeCount(), v.tubeChargeQuantity());
                }).toList();
        return new LaboratoryProfile(value.catalogItemId(), value.revision(), value.laboratoryMethod(),
                value.reportDuration(), value.reportDurationUnit(), value.fastingRequired(), value.pointOfCare(),
                value.collectionDescription(), rows);
    }

    private ExaminationProfile examinationView(ExaminationService value) {
        CatalogReference additionalItem = value.additionalSiteItemId() == null ? null
                : requireCatalogItem(value.tenantId(), value.additionalSiteItemId());
        return new ExaminationProfile(value.catalogItemId(), value.revision(), value.examinationType(),
                value.bodySiteRequired(), value.multiBodySite(), value.maxBodySiteCount(), value.preparationDescription(),
                value.sitePricingMode(), value.includedSiteCount(), value.additionalSitePrice(),
                value.additionalSiteItemId(), additionalItem == null ? null : additionalItem.code(),
                additionalItem == null ? null : additionalItem.name(), value.additionalSiteQuantity(),
                value.maxChargeableSiteCount(),
                variantRepository.findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(value.tenantId(), value.catalogItemId()).stream()
                        .map(v -> new ExaminationVariant(v.id(), v.revision(), v.bodySiteConceptId(), v.code(), v.name(),
                                v.methodType(), v.bodySiteRequired(), v.mutualRecognitionCode(), v.sortOrder(), v.status())).toList(),
                attachmentRepository.findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(value.tenantId(), value.catalogItemId()).stream()
                        .map(v -> {
                            CatalogReference item = requireCatalogItem(value.tenantId(), v.attachmentCatalogItemId());
                            return new ExaminationAttachment(v.id(), v.revision(), v.attachmentCatalogItemId(),
                                    item.code(), item.name(), v.triggerType(), v.quantityBasis(), v.quantity(),
                                    v.requiredAttachment(), v.separatelyChargeable(), v.sortOrder(),
                                    v.description(), v.status());
                        }).toList());
    }

    private SupplyView supplyView(Long tenantId, SupplyItem v) {
        Manufacturer m = v.manufacturerId() == null ? null : manufacturerRepository.findByIdAndTenantId(v.manufacturerId(), tenantId).orElse(null);
        return new SupplyView(v.id(), v.revision(), v.itemTypeId(), supplyType(v), v.code(), v.name(), v.unitCode(),
                v.orderable(), v.chargeable(), v.stocked(), v.status(), v.validFrom(), v.validTo(), v.udiDi(),
                v.genericCode(), v.genericName(), v.modelName(), v.specification(), v.materialType(), v.deviceClass(),
                v.highValue(), v.implant(), v.intervention(), v.sterile(), v.singleUse(), v.registrationCode(),
                v.registrationName(), v.registrantName(), v.registrationFrom(), v.registrationTo(), v.manufacturerId(),
                m == null ? null : m.name(), v.structureDescription(), v.scopeDescription(), v.instruction());
    }

    private ItemGroupView groupView(Long tenantId, ItemGroup group) {
        List<ItemGroupMember> members = memberRepository.findByTenantIdAndItemGroupIdOrderBySortOrder(tenantId, group.id());
        Map<Long, ServiceCatalogItem> services = members.stream().map(ItemGroupMember::catalogItemId).distinct()
                .map(id -> serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").orElse(null))
                .filter(Objects::nonNull).collect(Collectors.toMap(ServiceCatalogItem::id, Function.identity()));
        return new ItemGroupView(group.id(), group.revision(), group.organizationId(), group.executionDepartmentId(),
                group.code(), group.name(), group.groupType(), group.usageType(), group.pointOfCare(), group.status(),
                group.validFrom(), group.validTo(), members.stream().map(v -> {
                    ServiceCatalogItem item = services.get(v.catalogItemId());
                    return new GroupMemberView(v.id(), v.catalogItemId(), item == null ? null : item.code(),
                            item == null ? null : item.name(), item == null ? null : item.serviceType(), v.sortOrder(),
                            v.quantity(), v.unitCode(), v.requiredMember(), v.memberDescription());
                }).toList());
    }

    private void validateSpecimen(Long tenantId, Long serviceId, Long currentId, SpecimenCommand c) {
        requireDictionaryItem(tenantId, MasterDataDictionaryCodes.SPECIMEN_TYPE, c.specimenItemId());
        if (c.containerItemId() != null) requireDictionaryItem(tenantId, MasterDataDictionaryCodes.SPECIMEN_CONTAINER, c.containerItemId());
        if (text(c.minimumQuantityUnit()) != null) requireUnit(tenantId, c.minimumQuantityUnit(), true);
        requireStatus(c.status());
        if (!Set.of("SEPARATE", "SHARE", "BY_TEST_COUNT").contains(c.tubeSharingMode())) {
            throw badRequest("LAB_TUBE_SHARING_MODE_INVALID", "分管方式不受支持");
        }
        if (!"SEPARATE".equals(c.tubeSharingMode()) && text(c.tubeGroupCode()) == null) {
            throw badRequest("LAB_TUBE_GROUP_REQUIRED", "合管或按项目数分管时必须填写分管编码");
        }
        if (!"SEPARATE".equals(c.tubeSharingMode()) && c.containerItemId() == null) {
            throw badRequest("LAB_TUBE_CONTAINER_REQUIRED", "合管或按项目数分管时必须指定采集容器");
        }
        if ("BY_TEST_COUNT".equals(c.tubeSharingMode()) && (c.maxTestsPerTube() == null || c.maxTestsPerTube() <= 0)) {
            throw badRequest("LAB_MAX_TESTS_PER_TUBE_REQUIRED", "按项目数分管时必须填写每管最大项目数");
        }
        if (!Set.of("NONE", "PER_TUBE", "EXCESS_TUBE").contains(c.tubeChargeMode())) {
            throw badRequest("LAB_TUBE_CHARGE_MODE_INVALID", "试管加收方式不受支持");
        }
        if (!"NONE".equals(c.tubeChargeMode())) {
            if (c.tubeChargeItemId() == null) throw badRequest("LAB_TUBE_CHARGE_ITEM_REQUIRED", "启用试管加收时必须选择加收项目");
            if (Objects.equals(c.tubeChargeItemId(), serviceId)) throw badRequest("LAB_TUBE_CHARGE_ITEM_SELF", "试管加收项目不能引用检验项目自身");
            requireChargeableCatalogItem(tenantId, c.tubeChargeItemId());
        } else if (c.tubeChargeItemId() != null) {
            throw badRequest("LAB_TUBE_CHARGE_ITEM_UNUSED", "未启用试管加收时不能配置加收项目");
        }
        List<LaboratoryServiceSpecimen> peers = specimenRepository.findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(tenantId, serviceId).stream()
                .filter(v -> !Objects.equals(v.id(), currentId)).toList();
        if (peers.stream().anyMatch(v -> v.specimenItemId().equals(c.specimenItemId()))) throw conflict("LAB_SPECIMEN_DUPLICATE", "同一检验项目不能重复配置相同标本");
        if (peers.stream().anyMatch(v -> v.sortOrder() == c.sortOrder())) throw conflict("LAB_SPECIMEN_SORT_DUPLICATE", "标本排序号不能重复");
        if (c.defaultSpecimen() && "ACTIVE".equals(c.status())
                && peers.stream().anyMatch(v -> v.defaultSpecimen() && "ACTIVE".equals(v.status()))) {
            throw conflict("LAB_DEFAULT_SPECIMEN_DUPLICATE", "同一检验项目只能有一个启用的默认标本");
        }
        String groupCode = text(c.tubeGroupCode());
        if (groupCode != null && !"SEPARATE".equals(c.tubeSharingMode())) {
            boolean inconsistent = specimenRepository.findAll().stream()
                    .filter(v -> tenantId.equals(v.tenantId()) && !Objects.equals(v.id(), currentId))
                    .filter(v -> "ACTIVE".equals(v.status()) && groupCode.equalsIgnoreCase(v.tubeGroupCode()))
                    .anyMatch(v -> !Objects.equals(v.specimenItemId(), c.specimenItemId())
                            || !Objects.equals(v.containerItemId(), c.containerItemId())
                            || !Objects.equals(v.tubeSharingMode(), c.tubeSharingMode())
                            || !Objects.equals(v.maxTestsPerTube(), c.maxTestsPerTube())
                            || !Objects.equals(v.tubeChargeMode(), c.tubeChargeMode())
                            || !Objects.equals(v.tubeChargeItemId(), c.tubeChargeItemId())
                            || v.includedTubeCount() != c.includedTubeCount()
                            || v.tubeChargeQuantity().compareTo(c.tubeChargeQuantity()) != 0);
            if (inconsistent) throw conflict("LAB_TUBE_GROUP_RULE_CONFLICT", "同一分管编码必须使用一致的标本、容器、分管和加收规则");
        }
    }

    private void validateSitePricing(Long tenantId, Long serviceId, boolean bodySiteRequired,
            boolean multiBodySite, Integer maxBodySiteCount, String mode, int includedSiteCount,
            BigDecimal additionalSitePrice, Long additionalSiteItemId,
            BigDecimal additionalSiteQuantity, Integer maxChargeableSiteCount) {
        if (!Set.of("SINGLE", "PER_SITE", "BASE_PLUS_FIXED", "BASE_PLUS_ITEM").contains(mode)) {
            throw badRequest("EXAM_SITE_PRICING_MODE_INVALID", "多部位计价方式不受支持");
        }
        if (!multiBodySite && !"SINGLE".equals(mode)) {
            throw badRequest("EXAM_MULTI_SITE_PRICING_NOT_ALLOWED", "仅允许多部位的检查项目配置多部位计价");
        }
        if (!bodySiteRequired && !"SINGLE".equals(mode)) {
            throw badRequest("EXAM_BODY_SITE_PRICING_INVALID", "未要求检查部位的项目不能配置部位计价");
        }
        if (includedSiteCount < 1 || maxBodySiteCount != null && includedSiteCount > maxBodySiteCount) {
            throw badRequest("EXAM_INCLUDED_SITE_COUNT_INVALID", "包含部位数必须在项目部位上限内");
        }
        if (maxChargeableSiteCount != null && (maxChargeableSiteCount < includedSiteCount
                || maxBodySiteCount != null && maxChargeableSiteCount > maxBodySiteCount)) {
            throw badRequest("EXAM_CHARGEABLE_SITE_COUNT_INVALID", "最大计费部位数必须在包含部位数与项目部位上限之间");
        }
        if ("BASE_PLUS_FIXED".equals(mode)) {
            if (additionalSitePrice == null || additionalSitePrice.signum() < 0) {
                throw badRequest("EXAM_ADDITIONAL_SITE_PRICE_REQUIRED", "固定加收模式必须填写多部位加收金额");
            }
            if (additionalSiteItemId != null) throw badRequest("EXAM_SITE_PRICE_RULE_CONFLICT", "固定金额和加收项目不能同时配置");
        } else if ("BASE_PLUS_ITEM".equals(mode)) {
            if (additionalSiteItemId == null) throw badRequest("EXAM_ADDITIONAL_SITE_ITEM_REQUIRED", "加收项目模式必须选择收费项目");
            if (Objects.equals(serviceId, additionalSiteItemId)) throw badRequest("EXAM_ADDITIONAL_SITE_ITEM_SELF", "多部位加收项目不能引用检查项目自身");
            requireChargeableCatalogItem(tenantId, additionalSiteItemId);
        } else if (additionalSitePrice != null || additionalSiteItemId != null) {
            throw badRequest("EXAM_SITE_PRICE_RULE_UNUSED", "当前计价模式不能配置固定加收金额或加收项目");
        }
        if (additionalSiteQuantity == null || additionalSiteQuantity.signum() <= 0) {
            throw badRequest("EXAM_ADDITIONAL_SITE_QUANTITY_INVALID", "多部位加收数量必须大于0");
        }
    }

    private void validateAttachment(Long tenantId, Long serviceId, Long currentId,
            ExaminationAttachmentCommand c) {
        if (Objects.equals(serviceId, c.attachmentCatalogItemId())) {
            throw badRequest("EXAM_ATTACHMENT_SELF_REFERENCE", "附件项目不能引用检查项目自身");
        }
        CatalogReference item = requireCatalogItem(tenantId, c.attachmentCatalogItemId());
        if (c.separatelyChargeable() && !item.chargeable()) {
            throw badRequest("EXAM_ATTACHMENT_NOT_CHARGEABLE", "单独计费的附件项目必须为可收费目录项目");
        }
        if (c.requiredAttachment() && "OPTIONAL".equals(c.triggerType())) {
            throw badRequest("EXAM_ATTACHMENT_REQUIRED_OPTIONAL", "必带附件不能设置为可选触发");
        }
        List<ExaminationAttachmentItem> peers = attachmentRepository
                .findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(tenantId, serviceId).stream()
                .filter(v -> !Objects.equals(v.id(), currentId)).toList();
        if (peers.stream().anyMatch(v -> v.attachmentCatalogItemId().equals(c.attachmentCatalogItemId()))) {
            throw conflict("EXAM_ATTACHMENT_DUPLICATE", "同一检查项目不能重复配置相同附件项目");
        }
        if (peers.stream().anyMatch(v -> v.sortOrder() == c.sortOrder())) {
            throw conflict("EXAM_ATTACHMENT_SORT_DUPLICATE", "附件项目排序号不能重复");
        }
        requireStatus(c.status());
    }

    private void validateVariant(Long tenantId, Long serviceId, Long currentId, ExaminationVariantCommand c) {
        if (text(c.methodType()) != null) requireDictionaryCode(tenantId, MasterDataDictionaryCodes.SERVICE_VARIANT_METHOD, c.methodType());
        boolean duplicate = variantRepository.findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(tenantId, serviceId).stream()
                .filter(v -> !Objects.equals(v.id(), currentId)).anyMatch(v -> v.code().equalsIgnoreCase(c.code()));
        if (duplicate) throw conflict("EXAM_VARIANT_CODE_DUPLICATE", "同一检查项目不能重复配置部位方式编码");
    }

    private void validateSupply(Long tenantId, Long currentId, SupplyCommand c) {
        if (!Set.of("CONSUMABLE", "DEVICE").contains(c.supplyType())) throw badRequest("SUPPLY_TYPE_INVALID", "耗材类型必须为医用耗材或医疗器械");
        requireUnit(tenantId, c.unitCode(), true);
        if (c.manufacturerId() != null && manufacturerRepository.findByIdAndTenantId(c.manufacturerId(), tenantId).isEmpty()) throw notFound("MANUFACTURER_NOT_FOUND", "未找到生产厂商");
        if (currentId == null && supplyRepository.existsByTenantIdAndCode(tenantId, c.code())) {
            throw conflict("SUPPLY_CODE_DUPLICATE", "当前租户已存在相同耗材/器械编码");
        }
        if (currentId != null) {
            SupplyItem current = requireSupply(tenantId, currentId);
            if (!current.code().equalsIgnoreCase(c.code())) {
                throw badRequest("SUPPLY_CODE_IMMUTABLE", "耗材/器械编码创建后不允许修改");
            }
        }
        String udi = text(c.udiDi());
        if (udi != null) {
            boolean duplicate = supplyRepository.findByTenantIdOrderByName(tenantId).stream()
                    .filter(v -> !Objects.equals(v.id(), currentId)).anyMatch(v -> udi.equals(v.udiDi()));
            if (duplicate) throw conflict("SUPPLY_UDI_DUPLICATE", "当前租户已存在相同 UDI-DI");
        }
        String registrationCode = text(c.registrationCode());
        if (registrationCode != null) {
            boolean duplicate = supplyRepository.findByTenantIdOrderByName(tenantId).stream()
                    .filter(v -> !Objects.equals(v.id(), currentId))
                    .anyMatch(v -> registrationCode.equalsIgnoreCase(v.registrationCode()));
            if (duplicate) throw conflict("SUPPLY_REGISTRATION_DUPLICATE", "当前租户已存在相同注册证号");
        }
    }

    private void validateGroup(Long tenantId, Long currentId, ItemGroupCommand c) {
        if (c.organizationId() != null) organizationDirectory.requireOrganization(tenantId, c.organizationId());
        if (c.executionDepartmentId() != null) organizationDirectory.requireDepartment(tenantId, c.organizationId(), c.executionDepartmentId());
        boolean duplicate = groupRepository.findByTenantIdOrderByName(tenantId).stream()
                .filter(v -> !Objects.equals(v.id(), currentId)).anyMatch(v -> Objects.equals(v.organizationId(), c.organizationId()) && v.code().equalsIgnoreCase(c.code()));
        if (duplicate) throw conflict("ITEM_GROUP_CODE_DUPLICATE", "当前范围已存在相同组套编码");
        if (currentId != null) {
            ItemGroup current = requireGroup(tenantId, currentId);
            if (!current.code().equalsIgnoreCase(c.code())) {
                throw badRequest("ITEM_GROUP_CODE_IMMUTABLE", "组套编码创建后不允许修改");
            }
        }
        List<GroupMemberCommand> members = c.members() == null ? List.of() : c.members();
        if (members.isEmpty()) throw badRequest("ITEM_GROUP_MEMBERS_REQUIRED", "组套至少需要一个成员");
        if (members.stream().map(GroupMemberCommand::catalogItemId).distinct().count() != members.size()) throw conflict("ITEM_GROUP_MEMBER_DUPLICATE", "组套成员不能重复");
        if (members.stream().map(GroupMemberCommand::sortOrder).distinct().count() != members.size()) throw conflict("ITEM_GROUP_SORT_DUPLICATE", "组套成员排序号不能重复");
        for (GroupMemberCommand member : members) {
            ServiceCatalogItem item = requireService(tenantId, member.catalogItemId());
            if ("LIS".equals(c.groupType()) && !"LABORATORY".equals(item.serviceType())) throw badRequest("LIS_GROUP_MEMBER_INVALID", "LIS 组套只允许加入检验项目");
            if ("PACS".equals(c.groupType()) && !"EXAMINATION".equals(item.serviceType())) throw badRequest("PACS_GROUP_MEMBER_INVALID", "PACS 组套只允许加入检查项目");
            if (text(member.unitCode()) != null) requireUnit(tenantId, member.unitCode(), true);
        }
    }

    private void validateUnitChange(Long tenantId, UnitDefinition current, UnitCommand command) {
        String status = requireStatus(command.status());
        List<UnitConversion> rules = conversionRepository.findByTenantIdOrderByScopeCodeAscValidFromDesc(tenantId);
        boolean referencedByRule = rules.stream().anyMatch(v -> v.fromUnitId().equals(current.id()) || v.toUnitId().equals(current.id()));
        if (!current.dimension().equals(command.dimension()) && referencedByRule) {
            throw conflict("UNIT_DIMENSION_IN_USE", "计量单位已被换算规则引用，不能修改计量维度");
        }
        if (!"INACTIVE".equals(status) || "INACTIVE".equals(current.status())) return;
        String code = current.code();
        boolean usedBySupply = supplyRepository.findByTenantIdOrderByName(tenantId).stream()
                .anyMatch(v -> "ACTIVE".equals(v.status()) && code.equalsIgnoreCase(v.unitCode()));
        boolean usedBySpecimen = specimenRepository.findAll().stream()
                .anyMatch(v -> tenantId.equals(v.tenantId()) && "ACTIVE".equals(v.status())
                        && code.equalsIgnoreCase(v.minimumQuantityUnit()));
        boolean usedByReport = laboratoryRepository.findAll().stream()
                .anyMatch(v -> tenantId.equals(v.tenantId()) && code.equalsIgnoreCase(v.reportDurationUnit()));
        boolean usedByActiveRule = rules.stream().anyMatch(v -> "ACTIVE".equals(v.status())
                && (v.fromUnitId().equals(current.id()) || v.toUnitId().equals(current.id())));
        if (usedBySupply || usedBySpecimen || usedByReport || usedByActiveRule) {
            throw conflict("UNIT_IN_USE", "计量单位仍被有效主数据或换算规则引用，不能停用");
        }
    }

    private void validateConversion(Long tenantId, Long currentId, ConversionCommand c,
            UnitDefinition from, UnitDefinition to) {
        if (!from.dimension().equals(to.dimension())) throw badRequest("UNIT_DIMENSION_MISMATCH", "换算单位必须属于同一计量维度");
        if (c.catalogItemId() != null && serviceRepository.findByIdAndTenantIdAndItemType(c.catalogItemId(), tenantId, "SERVICE").isEmpty()
                && supplyRepository.findByIdAndTenantId(c.catalogItemId(), tenantId).isEmpty()) throw notFound("CATALOG_ITEM_NOT_FOUND", "未找到换算适用的目录项目");
        if (c.validFrom() == null || c.validTo() != null && c.validTo().isBefore(c.validFrom()))
            throw badRequest("VALID_PERIOD_INVALID", "有效期起不能为空，且有效期止不能早于有效期起");
        boolean overlap = conversionRepository.findByTenantIdOrderByScopeCodeAscValidFromDesc(tenantId).stream()
                .filter(v -> !Objects.equals(v.id(), currentId))
                .filter(v -> Objects.equals(v.catalogItemId(), c.catalogItemId()) && v.fromUnitId().equals(from.id()) && v.toUnitId().equals(to.id()))
                .anyMatch(v -> overlaps(v.validFrom(), v.validTo(), c.validFrom(), c.validTo()));
        if (overlap) throw conflict("UNIT_CONVERSION_PERIOD_OVERLAP", "相同换算方向的有效期不能重叠");
    }

    private void saveMembers(Long tenantId, ItemGroup group, List<GroupMemberCommand> values) {
        List<ItemGroupMember> members = (values == null ? List.<GroupMemberCommand>of() : values).stream()
                .map(v -> new ItemGroupMember(tenantId, group.id(), v.catalogItemId(), v.sortOrder(),
                        v.quantity(), text(v.unitCode()), v.requiredMember(), text(v.memberDescription()))).toList();
        memberRepository.saveAll(members);
    }

    private List<DictionaryOption> options(Long tenantId, String code) {
        return dictionaryDirectory.resolveActiveItemReferences(tenantId, code).stream()
                .map(v -> new DictionaryOption(v.id(), v.code(), v.name(), v.sortOrder())).toList();
    }
    private void requireDictionaryItem(Long tenantId, String dictionaryCode, Long itemId) {
        if (itemId == null || dictionaryDirectory.resolveActiveItemReferences(tenantId, dictionaryCode).stream().noneMatch(v -> v.id().equals(itemId)))
            throw badRequest("DICTIONARY_ITEM_INVALID", "所选字典项不存在或已停用");
    }
    private void requireDictionaryCode(Long tenantId, String dictionaryCode, String itemCode) {
        if (dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode).stream().noneMatch(v -> v.code().equals(itemCode)))
            throw badRequest("DICTIONARY_CODE_INVALID", "所选字典编码不存在或已停用");
    }
    private UnitDefinition requireUnit(Long tenantId, String code, boolean active) {
        if (text(code) == null) throw badRequest("UNIT_REQUIRED", "计量单位不能为空");
        UnitDefinition value = unitRepository.findByTenantIdAndCode(tenantId, code.trim().toUpperCase(Locale.ROOT))
                .orElseThrow(() -> notFound("UNIT_NOT_FOUND", "未找到计量单位 " + code));
        if (active && !"ACTIVE".equals(value.status())) throw badRequest("UNIT_INACTIVE", "计量单位已停用");
        return value;
    }
    private UnitDefinition requireUnit(Long tenantId, Long id) { return unitRepository.findByIdAndTenantId(id, tenantId).orElseThrow(() -> notFound("UNIT_NOT_FOUND", "未找到计量单位")); }
    private ServiceCatalogItem requireService(Long tenantId, Long id) { return serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").orElseThrow(() -> notFound("SERVICE_NOT_FOUND", "未找到诊疗项目")); }
    private ServiceCatalogItem requireServiceType(Long tenantId, Long id, String type) { ServiceCatalogItem value = requireService(tenantId, id); if (!type.equals(value.serviceType())) throw badRequest("SERVICE_TYPE_MISMATCH", "诊疗项目类型不匹配"); return value; }
    private SupplyItem requireSupply(Long tenantId, Long id) { return supplyRepository.findByIdAndTenantId(id, tenantId).orElseThrow(() -> notFound("SUPPLY_NOT_FOUND", "未找到耗材/器械资料")); }
    private ItemGroup requireGroup(Long tenantId, Long id) { return groupRepository.findByIdAndTenantId(id, tenantId).orElseThrow(() -> notFound("ITEM_GROUP_NOT_FOUND", "未找到项目组套")); }
    private CatalogReference requireCatalogItem(Long tenantId, Long id) {
        if (id == null) throw badRequest("CATALOG_ITEM_REQUIRED", "目录项目不能为空");
        ServiceCatalogItem service = serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").orElse(null);
        if (service != null) return new CatalogReference(service.id(), service.code(), service.name(),
                service.unitCode(), service.chargeable(), service.status());
        SupplyItem supply = supplyRepository.findByIdAndTenantId(id, tenantId).orElse(null);
        if (supply != null) return new CatalogReference(supply.id(), supply.code(), supply.name(),
                supply.unitCode(), supply.chargeable(), supply.status());
        throw notFound("CATALOG_ITEM_NOT_FOUND", "未找到目录项目");
    }
    private CatalogReference requireChargeableCatalogItem(Long tenantId, Long id) {
        CatalogReference item = requireCatalogItem(tenantId, id);
        if (!item.chargeable() || !"ACTIVE".equals(item.status())) {
            throw badRequest("CHARGE_ITEM_UNAVAILABLE", "收费项目必须处于启用且可收费状态");
        }
        return item;
    }
    private String requireStatus(String status) { if (!STATUSES.contains(status)) throw badRequest("STATUS_INVALID", "状态必须为 ACTIVE 或 INACTIVE"); return status; }
    private void requireRevision(long current, long expected, String code) { if (current != expected) throw conflict(code, "数据已被其他用户修改，请刷新后重试"); }
    private boolean matches(String query, String... values) { String q = text(query); if (q == null) return true; q = q.toLowerCase(Locale.ROOT); for (String v : values) if (v != null && v.toLowerCase(Locale.ROOT).contains(q)) return true; return false; }
    private String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String supplyType(SupplyItem v) { return v.itemTypeId().equals(MasterDataItemTypes.SUPPLY_DEVICE) ? "DEVICE" : "CONSUMABLE"; }
    private UnitView unitView(UnitDefinition v) { return new UnitView(v.id(), v.revision(), v.code(), v.name(), v.symbol(), v.dimension(), v.decimalScale(), v.status()); }
    private ConversionView conversionView(UnitConversion v, Map<Long, UnitDefinition> units) { return new ConversionView(v.id(), v.revision(), v.catalogItemId(), v.scopeCode(), v.fromUnitId(), units.get(v.fromUnitId()).code(), v.toUnitId(), units.get(v.toUnitId()).code(), v.factor(), v.offsetValue(), v.validFrom(), v.validTo(), v.status()); }
    private boolean overlaps(LocalDate a1, LocalDate a2, LocalDate b1, LocalDate b2) { return (a2 == null || !a2.isBefore(b1)) && (b2 == null || !b2.isBefore(a1)); }
    private ExecutionContext current() { return contextProvider.requireCurrent(); }

    private DiagnosticChargeLine chargeLine(ServiceCatalogItem item, BigDecimal quantity, String sourceType,
            boolean separatelyChargeable, BigDecimal fixedAmount, String description) {
        return chargeLine(new CatalogReference(item.id(), item.code(), item.name(), item.unitCode(),
                item.chargeable(), item.status()), quantity, sourceType, separatelyChargeable, fixedAmount, description);
    }
    private DiagnosticChargeLine chargeLine(CatalogReference item, BigDecimal quantity, String sourceType,
            boolean separatelyChargeable, BigDecimal fixedAmount, String description) {
        return new DiagnosticChargeLine(item.id(), item.code(), item.name(), quantity,
                item.unitCode(), sourceType, separatelyChargeable, fixedAmount, description);
    }

    private LaboratoryServiceSpecimen resolveSpecimen(Long tenantId, LaboratoryOrderItemCommand order) {
        List<LaboratoryServiceSpecimen> active = specimenRepository
                .findByTenantIdAndCatalogItemIdOrderBySortOrderAsc(tenantId, order.serviceId()).stream()
                .filter(v -> "ACTIVE".equals(v.status())).toList();
        if (order.specimenConfigurationId() != null) {
            return active.stream().filter(v -> v.id().equals(order.specimenConfigurationId())).findFirst()
                    .orElseThrow(() -> badRequest("LAB_SPECIMEN_SELECTION_INVALID", "所选标本配置不存在、已停用或不属于检验项目"));
        }
        List<LaboratoryServiceSpecimen> defaults = active.stream().filter(LaboratoryServiceSpecimen::defaultSpecimen).toList();
        if (defaults.size() == 1) return defaults.getFirst();
        if (active.size() == 1) return active.getFirst();
        throw badRequest("LAB_SPECIMEN_SELECTION_REQUIRED", "检验项目存在多个可用标本，请明确选择标本配置");
    }

    private boolean compatibleTubeRule(LaboratoryServiceSpecimen a, LaboratoryServiceSpecimen b) {
        return Objects.equals(a.specimenItemId(), b.specimenItemId())
                && Objects.equals(a.containerItemId(), b.containerItemId())
                && Objects.equals(a.tubeSharingMode(), b.tubeSharingMode())
                && Objects.equals(a.maxTestsPerTube(), b.maxTestsPerTube())
                && Objects.equals(a.tubeChargeMode(), b.tubeChargeMode())
                && Objects.equals(a.tubeChargeItemId(), b.tubeChargeItemId())
                && a.includedTubeCount() == b.includedTubeCount()
                && a.tubeChargeQuantity().compareTo(b.tubeChargeQuantity()) == 0;
    }

    private List<UnitConversion> preferItemRules(List<UnitConversion> values, Long itemId) {
        if (itemId == null) return values.stream().filter(v -> v.catalogItemId() == null).toList();
        Set<String> itemPairs = values.stream().filter(v -> Objects.equals(v.catalogItemId(), itemId)).map(v -> v.fromUnitId() + ":" + v.toUnitId()).collect(Collectors.toSet());
        return values.stream().filter(v -> Objects.equals(v.catalogItemId(), itemId) || v.catalogItemId() == null && !itemPairs.contains(v.fromUnitId() + ":" + v.toUnitId())).toList();
    }
    private ConversionPath findPath(Long from, Long to, List<UnitConversion> rules) {
        record Node(Long id, BigDecimal factor, BigDecimal offset, List<Long> path) {}
        Map<Long, List<Edge>> edges = new HashMap<>();
        for (UnitConversion r : rules) {
            edges.computeIfAbsent(r.fromUnitId(), k -> new ArrayList<>()).add(new Edge(r.toUnitId(), r.factor(), r.offsetValue()));
            BigDecimal inv = BigDecimal.ONE.divide(r.factor(), MathContext.DECIMAL128);
            edges.computeIfAbsent(r.toUnitId(), k -> new ArrayList<>()).add(new Edge(r.fromUnitId(), inv, r.offsetValue().negate().multiply(inv, MathContext.DECIMAL128)));
        }
        Deque<Node> queue = new ArrayDeque<>(); queue.add(new Node(from, BigDecimal.ONE, BigDecimal.ZERO, List.of(from)));
        Set<Long> visited = new HashSet<>();
        while (!queue.isEmpty()) {
            Node n = queue.removeFirst(); if (!visited.add(n.id())) continue;
            if (n.id().equals(to)) return new ConversionPath(n.factor(), n.offset(), n.path());
            for (Edge e : edges.getOrDefault(n.id(), List.of())) {
                if (visited.contains(e.to())) continue;
                BigDecimal factor = n.factor().multiply(e.factor(), MathContext.DECIMAL128);
                BigDecimal offset = n.offset().multiply(e.factor(), MathContext.DECIMAL128).add(e.offset(), MathContext.DECIMAL128);
                List<Long> path = new ArrayList<>(n.path()); path.add(e.to()); queue.addLast(new Node(e.to(), factor, offset, List.copyOf(path)));
            }
        }
        return null;
    }
    private record Edge(Long to, BigDecimal factor, BigDecimal offset) {}
    private record ConversionPath(BigDecimal factor, BigDecimal offset, List<Long> unitIds) {}
    private record CatalogReference(Long id, String code, String name, String unitCode,
                                    boolean chargeable, String status) {}
    private static final class TubeAccumulator {
        private final String groupCode;
        private final LaboratoryServiceSpecimen specimen;
        private final List<Long> serviceIds = new ArrayList<>();
        private int requestedTests;
        private int minimumTubeCount;

        private TubeAccumulator(String groupCode, LaboratoryServiceSpecimen specimen) {
            this.groupCode = groupCode;
            this.specimen = specimen;
        }

        private void add(Long serviceId, int quantity, int baseTubeCount) {
            if (!serviceIds.contains(serviceId)) serviceIds.add(serviceId);
            requestedTests += quantity;
            if ("SEPARATE".equals(specimen.tubeSharingMode())) {
                minimumTubeCount += baseTubeCount * quantity;
            } else {
                minimumTubeCount = Math.max(minimumTubeCount, baseTubeCount);
            }
        }

        private int tubeCount() {
            if (!"BY_TEST_COUNT".equals(specimen.tubeSharingMode())) return minimumTubeCount;
            int byTests = (requestedTests + specimen.maxTestsPerTube() - 1) / specimen.maxTestsPerTube();
            return Math.max(minimumTubeCount, byTests);
        }
    }
}
