package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogChangeBatchRowView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogChangeBatchView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogLifecycleView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogAdoptionCandidateView;
import com.rhn.platform.masterdata.api.CatalogLifecycleViews.CatalogPackageOptionView;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogItemSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.api.MasterDataViews;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;
import com.rhn.platform.masterdata.domain.CatalogChangeBatch;
import com.rhn.platform.masterdata.domain.CatalogChangeBatchRow;
import com.rhn.platform.masterdata.domain.CatalogPrice;
import com.rhn.platform.masterdata.domain.ItemPackage;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.infrastructure.CatalogChangeBatchRepository;
import com.rhn.platform.masterdata.infrastructure.CatalogChangeBatchRowRepository;
import com.rhn.platform.masterdata.infrastructure.CatalogPriceRepository;
import com.rhn.platform.masterdata.infrastructure.ItemPackageRepository;
import com.rhn.platform.masterdata.infrastructure.ManufacturerRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.SupplyItemRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.api.PageResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.HexFormat;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class CatalogLifecycleService implements CatalogLifecycleDirectory {
    private static final Set<String> STATUS_VALUES = Set.of("ACTIVE", "SUSPENDED", "RETIRED");

    private final OrganizationCatalogItemRepository adoptionRepository;
    private final CatalogPriceRepository priceRepository;
    private final CatalogChangeBatchRepository batchRepository;
    private final CatalogChangeBatchRowRepository batchRowRepository;
    private final ServiceCatalogItemRepository serviceRepository;
    private final MedicationProductRepository productRepository;
    private final SupplyItemRepository supplyRepository;
    private final ManufacturerRepository manufacturerRepository;
    private final MedicationRepository medicationRepository;
    private final ItemPackageRepository packageRepository;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final MasterDataApplicationService masterDataApplicationService;

    public CatalogLifecycleService(OrganizationCatalogItemRepository adoptionRepository,
                                   CatalogPriceRepository priceRepository,
                                   CatalogChangeBatchRepository batchRepository,
                                   CatalogChangeBatchRowRepository batchRowRepository,
                                   ServiceCatalogItemRepository serviceRepository,
                                   MedicationProductRepository productRepository,
                                   SupplyItemRepository supplyRepository,
                                   ManufacturerRepository manufacturerRepository,
                                   MedicationRepository medicationRepository,
                                   ItemPackageRepository packageRepository,
                                   DictionaryDirectory dictionaryDirectory,
                                   OrganizationDirectory organizationDirectory,
                                   ExecutionContextProvider contextProvider, JsonCodec jsonCodec,
                                   MasterDataApplicationService masterDataApplicationService) {
        this.adoptionRepository = adoptionRepository; this.priceRepository = priceRepository;
        this.batchRepository = batchRepository; this.batchRowRepository = batchRowRepository;
        this.serviceRepository = serviceRepository; this.productRepository = productRepository;
        this.supplyRepository = supplyRepository;
        this.manufacturerRepository = manufacturerRepository;
        this.medicationRepository = medicationRepository;
        this.packageRepository = packageRepository; this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory; this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
        this.masterDataApplicationService = masterDataApplicationService;
    }

    @Transactional(readOnly = true)
    public CatalogLifecycleView maintenance(Long catalogItemId, Long organizationId, LocalDate businessDate) {
        ExecutionContext context = current();
        requireCatalogItem(context.tenantId(), catalogItemId);
        if (organizationId != null) {
            requireOrganizationScope(context, organizationId);
            organizationDirectory.requireOrganization(context.tenantId(), organizationId);
        }
        LocalDate at = businessDate == null ? LocalDate.now() : businessDate;
        List<OrganizationCatalogItem> adoptions = organizationId == null ? List.of() : adoptionRepository
                .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        context.tenantId(), organizationId, catalogItemId);
        List<CatalogPrice> prices = priceRepository
                .findByTenantIdAndCatalogItemIdOrderByValidFromDesc(context.tenantId(), catalogItemId).stream()
                .filter(value -> value.organizationId() == null || Objects.equals(value.organizationId(), organizationId))
                .toList();
        OrganizationCatalogItem currentAdoption = organizationId == null ? null
                : resolvedAdoption(context.tenantId(), organizationId, catalogItemId, at);
        return new CatalogLifecycleView(catalogItemId, organizationId, at,
                adoptionView(currentAdoption, organizationId),
                adoptions.stream().map(this::adoptionView).toList(),
                prices.stream().filter(value -> value.effectiveAt(at)).map(this::priceView).toList(),
                prices.stream().map(this::priceView).toList());
    }

    @Transactional(readOnly = true)
    public PageResult<CatalogAdoptionCandidateView> searchAdoptionCandidates(
            Long organizationId, String itemType, String query, int page, int size) {
        ExecutionContext context = current();
        requireOrganizationScope(context, organizationId);
        organizationDirectory.requireOrganization(context.tenantId(), organizationId);
        if (!Set.of("SERVICE", "MED_PRODUCT").contains(itemType)) {
            throw badRequest("CATALOG_CANDIDATE_TYPE_INVALID", "机构项目调入仅支持诊疗项目或药品产品");
        }
        int normalizedPage = Math.max(0, page);
        int normalizedSize = Math.min(Math.max(size, 10), 100);
        var pageable = PageRequest.of(normalizedPage, normalizedSize,
                Sort.by("name").ascending().and(Sort.by("id").ascending()));
        LocalDate today = LocalDate.now();
        if ("SERVICE".equals(itemType)) {
            Page<com.rhn.platform.masterdata.domain.ServiceCatalogItem> result = serviceRepository.search(
                    context.tenantId(), query, "", "ACTIVE", pageable);
            List<CatalogAdoptionCandidateView> values = result.getContent().stream().map(value -> candidate(
                    context.tenantId(), organizationId, value.id(), value.code(), value.name(), "SERVICE",
                    value.status(), today)).toList();
            return new PageResult<>(values, result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize());
        }
        Page<com.rhn.platform.masterdata.domain.MedicationProduct> result = productRepository.search(
                context.tenantId(), query, "ACTIVE", pageable);
        List<Long> productIds = result.getContent().stream().map(value -> value.id()).toList();
        Map<Long, List<CatalogPackageOptionView>> packages = (productIds.isEmpty() ? List.<ItemPackage>of()
                : packageRepository.findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscQuantityFactorAsc(
                        context.tenantId(), productIds))
                .stream().filter(value -> "ACTIVE".equals(value.status()))
                .collect(java.util.stream.Collectors.groupingBy(ItemPackage::catalogItemId,
                        java.util.stream.Collectors.mapping(value -> new CatalogPackageOptionView(
                                value.id(), value.unitCode(), value.unitName(), value.packageSpec()),
                                java.util.stream.Collectors.toList())));
        List<CatalogAdoptionCandidateView> values = result.getContent().stream().map(value -> candidate(
                context.tenantId(), organizationId, value.id(), value.code(), value.name(), "MED_PRODUCT",
                value.status(), today, packages.getOrDefault(value.id(), List.of()))).toList();
        return new PageResult<>(values, result.getTotalElements(), result.getTotalPages(), result.getNumber(), result.getSize());
    }

    private CatalogAdoptionCandidateView candidate(Long tenantId, Long organizationId, Long id, String code,
                                                    String name, String itemType, String centerStatus, LocalDate at) {
        return candidate(tenantId, organizationId, id, code, name, itemType, centerStatus, at, List.of());
    }

    private CatalogAdoptionCandidateView candidate(Long tenantId, Long organizationId, Long id, String code,
                                                    String name, String itemType, String centerStatus, LocalDate at,
                                                    List<CatalogPackageOptionView> packages) {
        OrganizationCatalogItem adoption = resolvedAdoption(tenantId, organizationId, id, at);
        String sourceType = adoption == null ? "NONE"
                : organizationId.equals(adoption.organizationId()) ? "LOCAL" : "SHARED";
        return new CatalogAdoptionCandidateView(id, code, name, itemType, centerStatus,
                adoptionView(adoption, organizationId), sourceType, packages);
    }

    @Override
    @Transactional(readOnly = true)
    public CatalogOperationalSnapshot resolve(Long tenantId, Long catalogItemId, Long organizationId,
                                              Long packageId, String priceType, LocalDate businessDate) {
        LocalDate at = businessDate == null ? LocalDate.now() : businessDate;
        CatalogItemSnapshot item = catalogItemSnapshot(tenantId, catalogItemId);
        PackageSnapshot itemPackage = packageId == null ? null : packageSnapshot(tenantId, catalogItemId, packageId);
        MedicationSnapshot medication = item.medicationId() == null ? null : medicationSnapshot(tenantId, item.medicationId());
        OrganizationCatalogItem adoption = organizationId == null ? null
                : resolvedAdoption(tenantId, organizationId, catalogItemId, at);
        CatalogPrice price = priceRepository.findByTenantIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, catalogItemId).stream()
                .filter(value -> value.effectiveAt(at) && value.priceType().equals(priceType))
                .filter(value -> value.organizationId() == null || value.organizationId().equals(organizationId))
                .filter(value -> value.packageId() == null || value.packageId().equals(packageId))
                .sorted(Comparator.<CatalogPrice, Boolean>comparing(value -> value.organizationId() != null).reversed()
                        .thenComparing(value -> value.packageId() != null, Comparator.reverseOrder())
                        .thenComparing(CatalogPrice::validFrom, Comparator.reverseOrder()))
                .findFirst().orElse(null);
        return new CatalogOperationalSnapshot(catalogItemId, organizationId, packageId, priceType, at,
                item, itemPackage, medication, adoptionView(adoption, organizationId),
                price == null ? null : priceView(price));
    }

    private CatalogItemSnapshot catalogItemSnapshot(Long tenantId, Long catalogItemId) {
        var service = serviceRepository.findByIdAndTenantIdAndItemType(catalogItemId, tenantId, "SERVICE").orElse(null);
        if (service != null) {
            return new CatalogItemSnapshot(service.id(), service.itemTypeId(), "SERVICE", null,
                    service.code(), service.name(), service.unitCode(), service.orderable(), service.chargeable(),
                    false, service.status(), service.validFrom(), service.validTo(), service.serviceType(),
                    service.specimenType(), service.examinationType(), null, null);
        }
        var product = productRepository.findByIdAndTenantIdAndItemType(catalogItemId, tenantId, "MED_PRODUCT").orElse(null);
        if (product != null) {
            String manufacturerName = product.manufacturerId() == null ? null
                    : manufacturerRepository.findByIdAndTenantId(product.manufacturerId(), tenantId)
                            .map(com.rhn.platform.masterdata.domain.Manufacturer::name).orElse(null);
            return new CatalogItemSnapshot(product.id(), product.itemTypeId(), "MED_PRODUCT", product.medicationId(),
                    product.code(), product.name(), product.unitCode(), product.orderable(), product.chargeable(),
                    product.stocked(), product.status(), product.validFrom(), product.validTo(), null, null, null,
                    product.manufacturerId(), manufacturerName);
        }
        var supply = supplyRepository.findByIdAndTenantId(catalogItemId, tenantId)
                .orElseThrow(() -> notFound("CATALOG_ITEM_NOT_FOUND", "未找到目录项目"));
        String manufacturerName = supply.manufacturerId() == null ? null
                : manufacturerRepository.findByIdAndTenantId(supply.manufacturerId(), tenantId)
                        .map(com.rhn.platform.masterdata.domain.Manufacturer::name).orElse(null);
        return new CatalogItemSnapshot(supply.id(), supply.itemTypeId(), "SUPPLY", null,
                supply.code(), supply.name(), supply.unitCode(), supply.orderable(), supply.chargeable(),
                supply.stocked(), supply.status(), supply.validFrom(), supply.validTo(), null, null, null,
                supply.manufacturerId(), manufacturerName);
    }

    private PackageSnapshot packageSnapshot(Long tenantId, Long catalogItemId, Long packageId) {
        ItemPackage value = packageRepository.findByIdAndTenantId(packageId, tenantId)
                .orElseThrow(() -> notFound("ITEM_PACKAGE_NOT_FOUND", "未找到项目包装"));
        if (!value.catalogItemId().equals(catalogItemId)) {
            throw badRequest("ITEM_PACKAGE_CATALOG_MISMATCH", "项目包装不属于当前目录项目");
        }
        return new PackageSnapshot(value.id(), value.unitCode(), value.unitName(), value.packageSpec(),
                value.quantityFactor(), value.usageType(), value.status(), value.validFrom(), value.validTo());
    }

    @Override
    @Transactional(readOnly = true)
    public MedicationSnapshot requireMedication(Long tenantId, Long medicationId) {
        return medicationSnapshot(tenantId, medicationId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<MasterDataViews.MedicationView> findMedicationsByProductCatalogItemIds(
            Long tenantId, Long organizationId, java.util.Collection<Long> catalogItemIds) {
        return masterDataApplicationService.findMedicationsByProductCatalogItemIds(tenantId, organizationId, catalogItemIds);
    }

    private MedicationSnapshot medicationSnapshot(Long tenantId, Long medicationId) {
        var value = medicationRepository.findByIdAndTenantId(medicationId, tenantId)
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到药品知识"));
        return new MedicationSnapshot(value.id(), value.itemTypeId(), value.code(), value.name(), value.aliasName(),
                value.medicationType(), value.doseForm(), value.preparationSpec(), value.preparationUnit(),
                value.strengthValue(), value.strengthUnit(), value.storageType(), value.prescriptionDrug(),
                value.essentialDrug(), value.antimicrobial(), value.antimicrobialLevel(),
                value.antimicrobialOutpatientAllowed(), value.antimicrobialConsultationRequired(),
                value.antimicrobialEmergencyAllowed(), value.antimicrobialMaxDays(), value.skinTestRequired(),
                value.skinTestMethod(), value.skinTestSolutionMode(), value.skinTestObservationMinutes(),
                value.skinTestResultValidityHours(), value.skinTestInstructions(),
                value.defaultDose(), value.defaultDoseUnit(), value.defaultRoute(), value.defaultFrequencyId(), value.defaultFrequency(),
                value.chronicDiseaseDrug(), value.singleOrder(), value.status());
    }

    @Transactional
    public CatalogLifecycleView createAdoption(Long catalogItemId, AdoptionInput input) {
        ExecutionContext context = current();
        requireOrganizationScope(context, input.organizationId());
        createAdoptionValue(context, catalogItemId, input, null, null);
        return maintenance(catalogItemId, input.organizationId(), input.validFrom());
    }

    @Transactional
    public CatalogLifecycleView replaceAdoption(Long adoptionId, long expectedRevision, AdoptionInput input) {
        ExecutionContext context = current();
        OrganizationCatalogItem replaced = requireAdoption(context.tenantId(), adoptionId);
        requireOrganizationScope(context, replaced.organizationId());
        if (!replaced.organizationId().equals(input.organizationId())) {
            throw badRequest("ADOPTION_REPLACEMENT_SCOPE_INVALID", "替代版本必须属于同一机构");
        }
        createAdoptionValue(context, replaced.catalogItemId(), input, replaced, expectedRevision);
        return maintenance(replaced.catalogItemId(), replaced.organizationId(), input.validFrom());
    }

    @Transactional
    public CatalogLifecycleView changeAdoptionStatus(Long adoptionId, long expectedRevision,
                                                      String status, LocalDate validTo) {
        ExecutionContext context = current();
        OrganizationCatalogItem value = requireAdoption(context.tenantId(), adoptionId);
        requireOrganizationScope(context, value.organizationId());
        requireLifecycleStatus(status);
        value.changeStatus(expectedRevision, status, validTo, actor(context));
        return maintenance(value.catalogItemId(), value.organizationId(), LocalDate.now());
    }

    @Transactional
    public CatalogLifecycleView createPrice(Long catalogItemId, PriceInput input) {
        ExecutionContext context = current();
        requireOrganizationScope(context, input.organizationId());
        createPriceValue(context, catalogItemId, input, null, null);
        return maintenance(catalogItemId, input.organizationId(), input.validFrom());
    }

    @Transactional
    public CatalogLifecycleView replacePrice(Long priceId, long expectedRevision, PriceInput input) {
        ExecutionContext context = current();
        CatalogPrice replaced = requirePrice(context.tenantId(), priceId);
        requireOrganizationScope(context, replaced.organizationId());
        if (!replaced.sameScope(input.organizationId(), input.packageId(), input.priceType())) {
            throw badRequest("PRICE_REPLACEMENT_SCOPE_INVALID", "调价版本必须保持机构、包装和价格类型不变");
        }
        createPriceValue(context, replaced.catalogItemId(), input, replaced, expectedRevision);
        return maintenance(replaced.catalogItemId(), replaced.organizationId(), input.validFrom());
    }

    @Override
    @Transactional
    public PriceView replacePriceVersion(CatalogLifecycleDirectory.PriceReplacement command) {
        ExecutionContext context = current();
        if (!context.tenantId().equals(command.tenantId())) {
            throw badRequest("PRICE_TENANT_SCOPE_INVALID", "调价价格版本不属于当前租户");
        }
        CatalogPrice replaced = requirePrice(context.tenantId(), command.currentPriceId());
        if (!replaced.catalogItemId().equals(command.catalogItemId())
                || !replaced.sameScope(command.organizationId(), command.packageId(), command.priceType())) {
            throw badRequest("PRICE_REPLACEMENT_SCOPE_INVALID", "调价版本必须保持目录项、机构、包装和价格类型不变");
        }
        CatalogPrice created = createPriceValue(context, command.catalogItemId(), new PriceInput(
                command.organizationId(), command.packageId(), command.priceType(), command.newPrice(),
                command.currencyCode(), command.priceDocumentCode(), command.reason(), command.validFrom(),
                null, "ACTIVE"), replaced, command.expectedRevision());
        return priceView(created);
    }

    @Transactional
    public CatalogLifecycleView changePriceStatus(Long priceId, long expectedRevision,
                                                   String status, LocalDate validTo) {
        ExecutionContext context = current();
        CatalogPrice value = requirePrice(context.tenantId(), priceId);
        requireOrganizationScope(context, value.organizationId());
        requireLifecycleStatus(status);
        value.changeStatus(expectedRevision, status, validTo, actor(context));
        return maintenance(value.catalogItemId(), value.organizationId(), LocalDate.now());
    }

    @Transactional
    public CatalogChangeBatchView adoptionBatch(String requestCode, String operationType, Long organizationId,
                                                 LocalDate businessDate, List<Long> catalogItemIds,
                                                 AdoptionTemplate template) {
        ExecutionContext context = current();
        requireOrganizationScope(context, organizationId);
        if (!Set.of("ADOPT", "RETIRE").contains(operationType)) {
            throw badRequest("ADOPTION_BATCH_OPERATION_INVALID", "机构目录批量操作仅支持采用或停用");
        }
        organizationDirectory.requireOrganization(context.tenantId(), organizationId);
        List<Long> itemIds = distinctItems(catalogItemIds);
        String requestHash = sha256(operationType + "|" + organizationId + "|" + businessDate + "|"
                + jsonCodec.write(itemIds) + "|" + jsonCodec.write(template));
        CatalogChangeBatch repeated = repeated(context.tenantId(), requestCode, "ADOPTION", operationType, requestHash);
        if (repeated != null) return batchView(repeated);
        itemIds.forEach(value -> requireCatalogItem(context.tenantId(), value));
        if ("ADOPT".equals(operationType) && template == null) {
            throw badRequest("ADOPTION_BATCH_TEMPLATE_REQUIRED", "批量采用必须提供机构目录配置");
        }
        CatalogChangeBatch batch = batchRepository.save(new CatalogChangeBatch(context.tenantId(), actor(context),
                "ADOPTION", operationType, organizationId, requestCode, requestHash, businessDate, itemIds.size()));
        List<CatalogChangeBatchRow> rows = new ArrayList<>();
        int succeeded = 0;
        for (int index = 0; index < itemIds.size(); index++) {
            Long itemId = itemIds.get(index); int rowNumber = index + 1;
            Object source = java.util.Map.of("catalogItemId", itemId, "operationType", operationType);
            try {
                OrganizationCatalogItem target;
                if ("RETIRE".equals(operationType)) {
                    target = currentAdoption(context.tenantId(), organizationId, itemId, businessDate);
                    if (target == null) throw conflict("ADOPTION_CURRENT_NOT_FOUND", "业务日期内没有可停用的机构目录版本");
                    target.changeStatus(target.revision(), "RETIRED", businessDate, actor(context));
                } else {
                    AdoptionInput input = template.toInput(organizationId, businessDate);
                    OrganizationCatalogItem current = currentAdoption(context.tenantId(), organizationId, itemId, businessDate);
                    target = createAdoptionValue(context, itemId, input, current,
                            current == null ? null : current.revision());
                }
                rows.add(CatalogChangeBatchRow.succeeded(context.tenantId(), batch.id(), rowNumber, itemId,
                        null, jsonCodec.write(source), "ORGANIZATION_ADOPTION", target.id(), actor(context)));
                succeeded++;
            } catch (BusinessException | IllegalArgumentException exception) {
                String code = exception instanceof BusinessException business ? business.code() : "BATCH_ROW_INVALID";
                rows.add(CatalogChangeBatchRow.failed(context.tenantId(), batch.id(), rowNumber, itemId,
                        null, jsonCodec.write(source), code, exception.getMessage(), actor(context)));
            }
        }
        batchRowRepository.saveAll(rows); batch.complete(succeeded, itemIds.size() - succeeded, actor(context));
        return batchView(batch, rows);
    }

    @Transactional
    public CatalogChangeBatchView priceBatch(String requestCode, Long organizationId, LocalDate businessDate,
                                              List<PriceBatchEntry> entries) {
        ExecutionContext context = current();
        requireOrganizationScope(context, organizationId);
        if (organizationId != null) organizationDirectory.requireOrganization(context.tenantId(), organizationId);
        if (entries == null || entries.isEmpty() || entries.size() > 500) {
            throw badRequest("PRICE_BATCH_SIZE_INVALID", "批量调价必须包含1至500条数据");
        }
        String requestHash = sha256(organizationId + "|" + businessDate + "|" + jsonCodec.write(entries));
        CatalogChangeBatch repeated = repeated(context.tenantId(), requestCode, "PRICE", "PRICE_UPSERT", requestHash);
        if (repeated != null) return batchView(repeated);
        entries.forEach(value -> requireCatalogItem(context.tenantId(), value.catalogItemId()));
        CatalogChangeBatch batch = batchRepository.save(new CatalogChangeBatch(context.tenantId(), actor(context),
                "PRICE", "PRICE_UPSERT", organizationId, requestCode, requestHash, businessDate, entries.size()));
        List<CatalogChangeBatchRow> rows = new ArrayList<>(); int succeeded = 0;
        for (int index = 0; index < entries.size(); index++) {
            PriceBatchEntry entry = entries.get(index); int rowNumber = index + 1;
            PriceInput input = entry.toInput(organizationId, businessDate);
            try {
                CatalogPrice replaced = entry.replacesPriceId() == null
                        ? currentPrice(context.tenantId(), entry.catalogItemId(), input, businessDate)
                        : requirePrice(context.tenantId(), entry.replacesPriceId());
                Long revision = replaced == null ? null : entry.expectedReplacesRevision() == null
                        ? replaced.revision() : entry.expectedReplacesRevision();
                CatalogPrice target = createPriceValue(context, entry.catalogItemId(), input, replaced, revision);
                rows.add(CatalogChangeBatchRow.succeeded(context.tenantId(), batch.id(), rowNumber,
                        entry.catalogItemId(), entry.packageId(), jsonCodec.write(entry), "CATALOG_PRICE",
                        target.id(), actor(context))); succeeded++;
            } catch (BusinessException | IllegalArgumentException exception) {
                String code = exception instanceof BusinessException business ? business.code() : "BATCH_ROW_INVALID";
                rows.add(CatalogChangeBatchRow.failed(context.tenantId(), batch.id(), rowNumber,
                        entry.catalogItemId(), entry.packageId(), jsonCodec.write(entry), code,
                        exception.getMessage(), actor(context)));
            }
        }
        batchRowRepository.saveAll(rows); batch.complete(succeeded, entries.size() - succeeded, actor(context));
        return batchView(batch, rows);
    }

    @Transactional(readOnly = true)
    public CatalogChangeBatchView batch(Long batchId) {
        ExecutionContext context = current();
        CatalogChangeBatch value = batchRepository.findByIdAndTenantId(batchId, context.tenantId())
                .orElseThrow(() -> notFound("CATALOG_CHANGE_BATCH_NOT_FOUND", "未找到目录批量操作记录"));
        if (value.organizationId() != null) requireOrganizationScope(context, value.organizationId());
        return batchView(value);
    }

    private OrganizationCatalogItem createAdoptionValue(ExecutionContext context, Long catalogItemId,
                                                          AdoptionInput input, OrganizationCatalogItem replaced,
                                                          Long expectedRevision) {
        requireCatalogItem(context.tenantId(), catalogItemId);
        organizationDirectory.requireOrganization(context.tenantId(), input.organizationId());
        if (input.defaultDepartmentId() != null) organizationDirectory.requireDepartment(
                context.tenantId(), input.organizationId(), input.defaultDepartmentId());
        requireCode(MasterDataDictionaryCodes.STATUS, input.status()); requireLifecycleStatus(input.status());
        requirePeriod(input.validFrom(), input.validTo());
        List<OrganizationCatalogItem> history = adoptionRepository
                .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        context.tenantId(), input.organizationId(), catalogItemId);
        history.stream().filter(value -> replaced == null || !value.id().equals(replaced.id()))
                .filter(value -> value.overlaps(input.validFrom(), input.validTo())).findAny()
                .ifPresent(value -> { throw conflict("ADOPTION_PERIOD_OVERLAP", "该机构目录已有重叠有效期版本"); });
        if (replaced != null) {
            if (!replaced.catalogItemId().equals(catalogItemId)) throw badRequest(
                    "ADOPTION_REPLACEMENT_ITEM_INVALID", "替代版本必须属于同一目录项目");
            replaced.replace(expectedRevision, input.validFrom(), actor(context));
        }
        return adoptionRepository.save(new OrganizationCatalogItem(context.tenantId(), actor(context),
                input.organizationId(), catalogItemId, input.defaultDepartmentId(), clean(input.localCode()),
                clean(input.localName()), input.orderable(), input.executable(), input.chargeable(),
                input.purchasable(), input.stocked(), input.dispensable(), input.returnable(), input.status(),
                input.validFrom(), input.validTo(), replaced == null ? null : replaced.id()));
    }

    private CatalogPrice createPriceValue(ExecutionContext context, Long catalogItemId, PriceInput input,
                                           CatalogPrice replaced, Long expectedRevision) {
        requireCatalogItem(context.tenantId(), catalogItemId);
        if (input.organizationId() != null) organizationDirectory.requireOrganization(context.tenantId(), input.organizationId());
        if (input.packageId() != null) {
            ItemPackage itemPackage = packageRepository.findByIdAndTenantId(input.packageId(), context.tenantId())
                    .orElseThrow(() -> notFound("ITEM_PACKAGE_NOT_FOUND", "未找到计价包装"));
            if (!itemPackage.catalogItemId().equals(catalogItemId)) throw badRequest(
                    "PRICE_PACKAGE_ITEM_MISMATCH", "计价包装不属于当前目录项目");
        }
        requireCode(MasterDataDictionaryCodes.PRICE_TYPE, input.priceType());
        requireCode(MasterDataDictionaryCodes.STATUS, input.status()); requireLifecycleStatus(input.status());
        requirePeriod(input.validFrom(), input.validTo());
        List<CatalogPrice> history = priceRepository
                .findByTenantIdAndCatalogItemIdOrderByValidFromDesc(context.tenantId(), catalogItemId);
        history.stream().filter(value -> replaced == null || !value.id().equals(replaced.id()))
                .filter(value -> value.sameScope(input.organizationId(), input.packageId(), input.priceType()))
                .filter(value -> value.overlaps(input.validFrom(), input.validTo())).findAny()
                .ifPresent(value -> { throw conflict("PRICE_PERIOD_OVERLAP", "相同计价范围已有重叠有效期价格"); });
        if (replaced != null) {
            if (!replaced.catalogItemId().equals(catalogItemId)
                    || !replaced.sameScope(input.organizationId(), input.packageId(), input.priceType())) {
                throw badRequest("PRICE_REPLACEMENT_SCOPE_INVALID", "调价版本必须保持目录项和计价范围不变");
            }
            replaced.replace(expectedRevision, input.validFrom(), actor(context));
        }
        return priceRepository.save(new CatalogPrice(context.tenantId(), actor(context), catalogItemId,
                input.organizationId(), input.packageId(), input.priceType(), input.price(),
                input.currencyCode(), clean(input.priceDocumentCode()), clean(input.priceReason()), input.validFrom(),
                input.validTo(), input.status(), replaced == null ? null : replaced.id()));
    }

    private OrganizationCatalogItem currentAdoption(Long tenantId, Long organizationId, Long catalogItemId, LocalDate at) {
        return adoptionRepository.findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, organizationId, catalogItemId).stream().filter(value -> value.effectiveAt(at))
                .findFirst().orElse(null);
    }

    private OrganizationCatalogItem resolvedAdoption(Long tenantId, Long organizationId, Long catalogItemId,
                                                       LocalDate at) {
        List<OrganizationCatalogItem> localHistory = adoptionRepository
                .findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                        tenantId, organizationId, catalogItemId);
        OrganizationCatalogItem localRule = localHistory.stream()
                .filter(value -> value.overlaps(at, at)).findFirst().orElse(null);
        if (localRule != null) return localRule.effectiveAt(at) ? localRule : null;
        Long sourceOrganizationId = organizationDirectory.catalogSourceOrganizationId(tenantId, organizationId);
        return sourceOrganizationId == null ? null
                : currentAdoption(tenantId, sourceOrganizationId, catalogItemId, at);
    }

    private CatalogPrice currentPrice(Long tenantId, Long catalogItemId, PriceInput input, LocalDate at) {
        return priceRepository.findByTenantIdAndCatalogItemIdOrderByValidFromDesc(tenantId, catalogItemId).stream()
                .filter(value -> value.sameScope(input.organizationId(), input.packageId(), input.priceType()))
                .filter(value -> value.effectiveAt(at)).findFirst().orElse(null);
    }

    private CatalogChangeBatch repeated(Long tenantId, String requestCode, String batchType, String operationType,
                                        String requestHash) {
        CatalogChangeBatch value = batchRepository.findByTenantIdAndRequestCode(tenantId, requestCode).orElse(null);
        if (value != null && (!value.batchType().equals(batchType) || !value.operationType().equals(operationType)
                || !value.requestHash().equals(requestHash))) {
            throw conflict("CATALOG_CHANGE_REQUEST_REUSED", "相同请求编码已用于其他目录批量操作");
        }
        return value;
    }

    private CatalogChangeBatchView batchView(CatalogChangeBatch value) {
        return batchView(value, batchRowRepository.findByTenantIdAndBatchIdOrderByRowNumber(value.tenantId(), value.id()));
    }

    private CatalogChangeBatchView batchView(CatalogChangeBatch value, List<CatalogChangeBatchRow> rows) {
        return new CatalogChangeBatchView(value.id(), value.revision(), value.batchType(), value.operationType(),
                value.organizationId(), value.requestCode(), value.businessDate(), value.status(), value.totalRows(),
                value.succeededRows(), value.failedRows(), value.createdAt(), value.createdBy(), value.updatedAt(),
                rows.stream().map(row -> new CatalogChangeBatchRowView(row.id(), row.rowNumber(), row.catalogItemId(),
                        row.packageId(), row.status(), row.targetResourceType(), row.targetId(), row.errorCode(),
                        row.errorMessage())).toList());
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

    private PriceView priceView(CatalogPrice value) {
        return new PriceView(value.id(), value.revision(), value.organizationId(), value.packageId(), value.priceType(),
                value.price(), value.currencyCode(), value.priceDocumentCode(), value.priceReason(), value.validFrom(),
                value.validTo(), value.status(), value.replacesPriceId());
    }

    private OrganizationCatalogItem requireAdoption(Long tenantId, Long id) {
        return adoptionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("ADOPTION_NOT_FOUND", "未找到机构目录版本"));
    }

    private CatalogPrice requirePrice(Long tenantId, Long id) {
        return priceRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("CATALOG_PRICE_NOT_FOUND", "未找到目录价格版本"));
    }

    private void requireCatalogItem(Long tenantId, Long id) {
        if (serviceRepository.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").isEmpty()
                && productRepository.findByIdAndTenantIdAndItemType(id, tenantId, "MED_PRODUCT").isEmpty()
                && supplyRepository.findByIdAndTenantId(id, tenantId).isEmpty()) {
            throw notFound("CATALOG_ITEM_NOT_FOUND", "未找到目录项目");
        }
    }

    private List<Long> distinctItems(List<Long> values) {
        if (values == null || values.isEmpty() || values.size() > 500) {
            throw badRequest("CATALOG_BATCH_SIZE_INVALID", "批量操作必须包含1至500个目录项目");
        }
        List<Long> result = values.stream().distinct().toList();
        if (result.size() != values.size()) throw badRequest("CATALOG_BATCH_ITEM_DUPLICATE", "批量操作包含重复目录项目");
        return result;
    }

    private void requirePeriod(LocalDate from, LocalDate to) {
        if (from == null || (to != null && to.isBefore(from))) throw badRequest(
                "CATALOG_LIFECYCLE_PERIOD_INVALID", "失效日期不能早于生效日期");
    }

    private void requireLifecycleStatus(String status) {
        if (!STATUS_VALUES.contains(status)) throw badRequest(
                "CATALOG_LIFECYCLE_STATUS_INVALID", "采用和价格版本仅支持启用、暂停或停用状态");
    }

    private void requireCode(String dictionary, String code) {
        if (code == null || dictionaryDirectory.resolveActiveItems(current().tenantId(), dictionary).stream()
                .noneMatch(value -> value.code().equals(code))) throw badRequest(
                "MASTER_DATA_CODE_INVALID", "代码 " + code + " 不属于字典 " + dictionary);
    }

    private Long actor(ExecutionContext context) {
        if (context.subjectId() == null) throw badRequest("ACTOR_REQUIRED", "当前操作缺少可审计用户身份");
        return context.subjectId();
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }
    private void requireOrganizationScope(ExecutionContext context, Long organizationId) {
        if (organizationId == null) {
            if (!context.hasAuthority("MASTER_DATA.MANAGE")) {
                throw forbidden("ORG_CATALOG_SCOPE_FORBIDDEN", "机构项目管理必须指定当前工作机构");
            }
            return;
        }
        if (!context.hasAuthority("MASTER_DATA.MANAGE")
                && !Objects.equals(context.organizationId(), organizationId)) {
            throw forbidden("ORG_CATALOG_SCOPE_FORBIDDEN", "不能维护当前工作机构以外的项目目录");
        }
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }

    public record AdoptionInput(
            Long organizationId, Long defaultDepartmentId, String localCode, String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable, String status,
            LocalDate validFrom, LocalDate validTo) {}

    public record PriceInput(
            Long organizationId, Long packageId, String priceType, BigDecimal price, String currencyCode,
            String priceDocumentCode, String priceReason, LocalDate validFrom, LocalDate validTo, String status) {}

    public record AdoptionTemplate(
            Long defaultDepartmentId, String localCode, String localName,
            boolean orderable, boolean executable, boolean chargeable, boolean purchasable,
            boolean stocked, boolean dispensable, boolean returnable, String status, LocalDate validTo) {
        AdoptionInput toInput(Long organizationId, LocalDate validFrom) {
            return new AdoptionInput(organizationId, defaultDepartmentId, localCode, localName, orderable,
                    executable, chargeable, purchasable, stocked, dispensable, returnable, status, validFrom, validTo);
        }
    }

    public record PriceBatchEntry(
            Long catalogItemId, Long packageId, String priceType, BigDecimal price, String currencyCode,
            String priceDocumentCode, String priceReason, LocalDate validTo, String status,
            Long replacesPriceId, Long expectedReplacesRevision) {
        PriceInput toInput(Long organizationId, LocalDate validFrom) {
            return new PriceInput(organizationId, packageId, priceType, price, currencyCode, priceDocumentCode,
                    priceReason, validFrom, validTo, status);
        }
    }
}
