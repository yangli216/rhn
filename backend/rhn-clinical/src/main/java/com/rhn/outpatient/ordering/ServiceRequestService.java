package com.rhn.outpatient.ordering;

import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OrderFulfillmentGuard;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.ExaminationSiteDirectory;
import com.rhn.platform.masterdata.api.ExaminationSiteDirectory.ExaminationSiteOption;
import com.rhn.platform.masterdata.api.MedicalOperationsViews.ExaminationChargePlan;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ServiceRequestService implements ServiceRequestDirectory {
    private final BusinessNumberGenerator numbers;

    private final OrderDocumentInfoSupport documentInfoSupport;
    private final ServiceRequestRepository repository;
    private final EncounterDirectory encounterDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final ItemAttributeSnapshotDirectory attributeDirectory;
    private final ItemStandardMappingDirectory mappingDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final com.rhn.outpatient.api.OrderDocumentExecutionDirectory diagnosticDocuments;
    private final OrderCancellationPolicy cancellationPolicy;
    private final ServiceDocumentRepository documentRepository;
    private final ServiceDocumentGroupingPolicy groupingPolicy;
    private final ExaminationSiteDirectory examinationSites;
    private final ServiceRequestSiteRepository siteRepository;
    private final ServiceRequestChargeLineRepository chargeLineRepository;

    ServiceRequestService(ServiceRequestRepository repository, EncounterDirectory encounterDirectory,
                          CatalogLifecycleDirectory catalogDirectory,
                          ItemAttributeSnapshotDirectory attributeDirectory,
                          ItemStandardMappingDirectory mappingDirectory,
                          OrganizationDirectory organizationDirectory,
                          DomainEventPublisher eventPublisher,
                          ExecutionContextProvider contextProvider, JsonCodec jsonCodec, OrderDocumentInfoSupport documentInfoSupport,
                          com.rhn.outpatient.api.OrderDocumentExecutionDirectory diagnosticDocuments,
                          OrderCancellationPolicy cancellationPolicy, BusinessNumberGenerator numbers,
                          ServiceDocumentRepository documentRepository, ServiceDocumentGroupingPolicy groupingPolicy,
                          ExaminationSiteDirectory examinationSites, ServiceRequestSiteRepository siteRepository,
                          ServiceRequestChargeLineRepository chargeLineRepository) {
        this.examinationSites = examinationSites;
        this.siteRepository = siteRepository;
        this.chargeLineRepository = chargeLineRepository;
        this.cancellationPolicy = cancellationPolicy;
        this.documentRepository = documentRepository;
        this.groupingPolicy = groupingPolicy;
        this.numbers = numbers;
        this.documentInfoSupport = documentInfoSupport;
        this.repository = repository;
        this.encounterDirectory = encounterDirectory;
        this.catalogDirectory = catalogDirectory;
        this.attributeDirectory = attributeDirectory;
        this.mappingDirectory = mappingDirectory;
        this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
        this.diagnosticDocuments = diagnosticDocuments;
    }

    @Transactional
    ServiceRequestResponse create(Long encounterId, CreateServiceRequest input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        return response(persist(encounter, resolve(encounter, input), false));
    }

    /**
     * 整批保存草稿：逐项创建草稿并按机构合单规则归入申请单；任一项失败由调用方事务整体回滚。
     * 草稿不发布开立事件，收费与执行科室在一次开立命令激活后才可见。
     */
    @Transactional
    List<ServiceRequestResponse> createDrafts(Long encounterId, List<CreateServiceRequest> inputs) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        List<Resolved> resolved = inputs.stream().map(input -> resolve(encounter, input)).toList();
        List<ServiceRequest> created = resolved.stream().map(value -> persist(encounter, value, true)).toList();
        Long authoredBy = contextProvider.requireCurrent().subjectId();
        for (ServiceDocumentPlan plan : groupingPlans(encounter, resolved)) {
            var document = documentRepository.save(new ServiceDocument(encounter.tenantId(), encounter.residentId(),
                    encounter.id(), numbers.next("service-request", new BusinessNumberContext(encounter.tenantId(),
                            plan.performerOrganizationId(), plan.performerDepartmentId())),
                    plan.serviceType(), plan.performerOrganizationId(), plan.performerDepartmentId(),
                    plan.groupingRule(), plan.groupingValue(), authoredBy));
            plan.itemIndexes().forEach(index -> created.get(index).assignDocument(document.id()));
        }
        repository.flush();
        return responses(created);
    }

    /** 与整批开立同一套目录核对和合单规则，不写入任何数据。 */
    @Transactional(readOnly = true)
    List<ServiceDocumentPlan> previewDocuments(Long encounterId, List<CreateServiceRequest> inputs) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        return groupingPlans(encounter, inputs.stream().map(input -> resolve(encounter, input)).toList());
    }

    private List<ServiceDocumentPlan> groupingPlans(EncounterDirectory.EncounterSnapshot encounter, List<Resolved> resolved) {
        List<ServiceDocumentGroupingEngine.Fact> facts = new java.util.ArrayList<>();
        for (int index = 0; index < resolved.size(); index++) {
            var value = resolved.get(index);
            facts.add(new ServiceDocumentGroupingEngine.Fact(index, value.catalog().item().serviceType(),
                    value.performerOrganizationId(), value.performerDepartmentId(),
                    value.catalog().item().specimenType(), value.catalog().item().examinationType()));
        }
        return ServiceDocumentGroupingEngine.plan(facts, groupingPolicy.resolve(encounter));
    }

    private record Resolved(CreateServiceRequest input, LocalDate businessDate, Long performerOrganizationId,
                            Long performerDepartmentId, String unitCode,
                            com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog,
                            BigDecimal quantity, List<ExaminationSiteOption> sites, BigDecimal totalAmount,
                            ServiceRequestChargeLine.PricedLine mainLine,
                            List<ServiceRequestChargeLine.PricedLine> chargeLines) {}

    private record SiteSelection(BigDecimal quantity, List<ExaminationSiteOption> sites) {}

    /**
     * 检查部位只能取项目已启用的部位方式；选了部位或项目要求部位时，主项目数量按部位计价方式换算，
     * 不采用客户端数量。未维护检查配置或非检查项目不接受部位。
     */
    private SiteSelection selectSites(Long catalogItemId, String itemName, String serviceType, List<String> codes,
                                      BigDecimal requested) {
        var rule = "EXAMINATION".equals(serviceType) ? examinationSites.siteRule(catalogItemId) : java.util.Optional.<ExaminationSiteDirectory.ExaminationSiteRule>empty();
        if (rule.isEmpty()) {
            if (!codes.isEmpty()) throw badRequest("SERVICE_REQUEST_BODY_SITE_UNSUPPORTED", "该项目未配置检查部位，不能选择部位");
            return new SiteSelection(requested, List.of());
        }
        if (rule.get().bodySiteRequired() && codes.isEmpty()) {
            throw badRequest("EXAM_BODY_SITE_REQUIRED", "“" + itemName + "”必须选择检查部位");
        }
        List<ExaminationSiteOption> sites = rule.get().select(codes);
        if (sites.isEmpty()) return new SiteSelection(requested, List.of());
        return new SiteSelection(rule.get().baseQuantity(rule.get().chargeableSiteCount(sites)), sites);
    }

    private Resolved resolve(EncounterDirectory.EncounterSnapshot encounter, CreateServiceRequest input) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        LocalDate businessDate = input.businessDate() == null ? LocalDate.now() : input.businessDate();
        Long performerOrganizationId = input.performerOrganizationId() == null
                ? encounter.organizationId() : input.performerOrganizationId();
        String priceType = Strings.trimToNull(input.priceType()) == null ? "SALE" : Strings.trimToNull(input.priceType()).toUpperCase();
        boolean pricingRequired = input.pricingRequired() == null || input.pricingRequired();

        if (input.packageId() != null) {
            throw badRequest("SERVICE_REQUEST_PACKAGE_INVALID", "诊疗项目开立不使用药品包装");
        }

        var catalog = catalogDirectory.resolve(tenantId, input.catalogItemId(), performerOrganizationId,
                input.packageId(), priceType, businessDate);
        var item = catalog.item();
        if (!"SERVICE".equals(item.itemType())) {
            throw badRequest("SERVICE_REQUEST_ITEM_TYPE_INVALID", "门诊诊疗请求只能选择诊疗项目");
        }
        Long performerDepartmentId = input.performerDepartmentId();
        if (performerDepartmentId == null) {
            var defaultDepartment = com.rhn.platform.masterdata.api.ServiceExecutionDepartmentPolicy.resolve(
                    item.serviceType(), item.examinationType(), catalog.adoption() == null ? null : catalog.adoption().defaultDepartmentId(),
                    performerOrganizationId, organizationDirectory.listDepartments(tenantId, performerOrganizationId), businessDate);
            performerDepartmentId = defaultDepartment == null ? encounter.departmentId() : defaultDepartment.departmentId();
        }
        if (performerDepartmentId == null) throw badRequest("SERVICE_REQUEST_EXECUTION_DEPARTMENT_REQUIRED",
                "未匹配到唯一有效的执行科室，请选择执行科室或维护机构项目");
        // Ordering authority is verified on the encounter. A same-organization lab is a destination,
        // not an additional clinical work context for the requesting physician.
        if (context.hasWorkContext() && (!context.canAccessOrganization(performerOrganizationId)
                || (!performerOrganizationId.equals(encounter.organizationId()) && !context.canAccessDepartment(performerDepartmentId)))) {
            throw badRequest("SERVICE_REQUEST_PERFORMER_CONTEXT_INVALID", "执行机构或科室不在当前可访问范围内");
        }
        var department = organizationDirectory.requireDepartment(tenantId, performerOrganizationId, performerDepartmentId);
        if (!"ACTIVE".equals(department.sdOrgStatus()) || department.virtual() || department.validFrom().isAfter(businessDate)
                || (department.validTo() != null && department.validTo().isBefore(businessDate))) {
            throw badRequest("SERVICE_REQUEST_EXECUTION_DEPARTMENT_INVALID", "执行科室未启用或不在有效期内");
        }
        if (!"ACTIVE".equals(item.status()) || item.validFrom().isAfter(businessDate)
                || (item.validTo() != null && item.validTo().isBefore(businessDate))) {
            throw conflict("CATALOG_ITEM_NOT_EFFECTIVE", "目录项目在业务日期不可用");
        }
        if (!item.orderable()) {
            throw conflict("CATALOG_ITEM_NOT_ORDERABLE", "目录项目未开放开立能力");
        }
        var adoption = catalog.adoption();
        if (adoption == null) {
            throw conflict("ORGANIZATION_CATALOG_NOT_ADOPTED", "当前机构在业务日期尚未采用该项目");
        }
        if (!adoption.orderable()) {
            throw conflict("ORGANIZATION_CATALOG_NOT_ORDERABLE", "当前机构未开放该项目的开立能力");
        }
        String unitCode = Strings.trimToNull(input.unitCode()) == null ? item.unitCode() : Strings.trimToNull(input.unitCode());
        if (unitCode == null || !unitCode.equals(item.unitCode())) {
            throw badRequest("SERVICE_REQUEST_UNIT_INVALID", "申请单位必须与目录项目单位一致");
        }

        SiteSelection selection = selectSites(input.catalogItemId(), item.name(), item.serviceType(), input.sites(), input.quantity());
        var plan = examinationPlan(item.serviceType(), item.id(), selection);
        if (substitutesMainLine(plan, item.id())) {
            // 主收费行是主收费物价项或阶梯档位：开立项目本身不收费，价格全部取自收费方案。
            List<ServiceRequestChargeLine.PricedLine> lines = pricingRequired
                    ? chargeLines(plan, null, true, performerOrganizationId, priceType, businessDate) : List.of();
            return new Resolved(input, businessDate, performerOrganizationId, performerDepartmentId, unitCode, catalog,
                    selection.quantity(), selection.sites(), lines.isEmpty() ? null : sum(lines),
                    lines.isEmpty() ? null : lines.getFirst(), lines);
        }
        var price = catalog.price();
        if (pricingRequired) {
            if (!item.chargeable() || !adoption.chargeable()) {
                throw conflict("CATALOG_ITEM_NOT_CHARGEABLE", "目录项目或机构目录未开放收费能力");
            }
            if (price == null) {
                throw conflict("CATALOG_PRICE_NOT_CONFIGURED", "业务日期内未配置可用的机构价格");
            }
        }
        BigDecimal totalAmount = price == null ? null : price.price().multiply(selection.quantity());
        ServiceRequestChargeLine.PricedLine base = price == null ? null : new ServiceRequestChargeLine.PricedLine("BASE_SERVICE",
                item.id(), item.code(), item.name(), unitCode, selection.quantity(), price.id(), price.revision(),
                price.sdPriceType(), price.price(), totalAmount, price.currencyCode(), item.accountingCategory());
        List<ServiceRequestChargeLine.PricedLine> chargeLines = base == null || plan == null ? List.of()
                : chargeLines(plan, base, false, performerOrganizationId, priceType, businessDate);
        if (!chargeLines.isEmpty()) totalAmount = sum(chargeLines);
        return new Resolved(input, businessDate, performerOrganizationId, performerDepartmentId, unitCode, catalog,
                selection.quantity(), selection.sites(), totalAmount, base, chargeLines);
    }

    /** 检查项目已维护检查配置时按所选部位取收费方案；其余项目为空。 */
    private ExaminationChargePlan examinationPlan(String serviceType, Long catalogItemId, SiteSelection selection) {
        if (!"EXAMINATION".equals(serviceType)) return null;
        return examinationSites.chargePlan(catalogItemId,
                selection.sites().stream().map(ExaminationSiteOption::code).toList()).orElse(null);
    }

    /** 收费方案的主收费行不是开立项目自身：阶梯档位，或配置了主收费物价项。 */
    private static boolean substitutesMainLine(ExaminationChargePlan plan, Long catalogItemId) {
        if (plan == null) return false;
        return plan.lines().stream()
                .filter(line -> line.separatelyChargeable()
                        && ("BASE_SERVICE".equals(line.sourceType()) || "TIER".equals(line.sourceType())))
                .findFirst()
                .map(line -> "TIER".equals(line.sourceType()) || !catalogItemId.equals(line.catalogItemId()))
                .orElse(false);
    }

    /**
     * 检查项目按收费方案定价：主收费行是开立项目自身时沿用已定价的 base，否则（主收费物价项、阶梯档位）与多部位加收、
     * 附加项目一样按执行机构、价格类型和业务日期取价。主收费行是开立项目自身且方案只有一行时返回空，申请按单行收费；
     * 任一明细未开放收费或无价格时拒绝开立，不静默漏收。
     */
    private List<ServiceRequestChargeLine.PricedLine> chargeLines(ExaminationChargePlan plan,
            ServiceRequestChargeLine.PricedLine base, boolean substituted, Long performerOrganizationId,
            String priceType, LocalDate businessDate) {
        Long tenantId = TenantContext.requireTenantId();
        List<ServiceRequestChargeLine.PricedLine> lines = new ArrayList<>();
        for (var line : plan.lines()) {
            if (!line.separatelyChargeable()) continue;
            if ("BASE_SERVICE".equals(line.sourceType()) && base != null && base.catalogItemId().equals(line.catalogItemId())) {
                lines.add(base);
            } else if ("MULTI_SITE_FIXED".equals(line.sourceType())) {
                var main = lines.getFirst();
                lines.add(new ServiceRequestChargeLine.PricedLine(line.sourceType(),
                        main.catalogItemId(), main.itemCode(), main.itemName(), main.unitCode(), line.quantity(),
                        null, null, null, line.fixedAmount().divide(line.quantity(), 6, java.math.RoundingMode.HALF_UP),
                        line.fixedAmount(), main.currencyCode(), main.accountingCategory()));
            } else {
                var catalog = catalogDirectory.resolve(tenantId, line.catalogItemId(), performerOrganizationId,
                        null, priceType, businessDate);
                var price = catalog.price();
                if (!catalog.item().chargeable() || catalog.adoption() == null || !catalog.adoption().chargeable()
                        || price == null) {
                    throw conflict("EXAM_CHARGE_ITEM_UNAVAILABLE",
                            "收费项目“" + line.itemName() + "”在执行机构未开放收费或未配置价格");
                }
                if (!lines.isEmpty() && !Objects.equals(price.currencyCode(), lines.getFirst().currencyCode())) {
                    throw conflict("EXAM_CHARGE_CURRENCY_MISMATCH", "检查收费明细币种不一致");
                }
                lines.add(new ServiceRequestChargeLine.PricedLine(line.sourceType(), line.catalogItemId(),
                        catalog.item().code(), catalog.item().name(), catalog.item().unitCode(), line.quantity(),
                        price.id(), price.revision(), price.sdPriceType(), price.price(),
                        price.price().multiply(line.quantity()), price.currencyCode(), catalog.item().accountingCategory()));
            }
        }
        if (substituted) return List.copyOf(lines);
        return lines.size() <= 1 ? List.of() : List.copyOf(lines);
    }

    private static BigDecimal sum(List<ServiceRequestChargeLine.PricedLine> lines) {
        return lines.stream().map(ServiceRequestChargeLine.PricedLine::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private ServiceRequest persist(EncounterDirectory.EncounterSnapshot encounter, Resolved resolved, boolean draft) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        CreateServiceRequest input = resolved.input();
        LocalDate businessDate = resolved.businessDate();
        Long performerOrganizationId = resolved.performerOrganizationId();
        Long performerDepartmentId = resolved.performerDepartmentId();
        String unitCode = resolved.unitCode();
        var item = resolved.catalog().item();
        var adoption = resolved.catalog().adoption();
        var main = resolved.mainLine();
        BigDecimal totalAmount = resolved.totalAmount();
        var contexts = new ItemAttributeSnapshotDirectory.AttributeContexts(
                new ItemAttributeSnapshotDirectory.AttributeScope(encounter.organizationId(), encounter.departmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(performerOrganizationId, performerDepartmentId),
                null, null);
        var attributes = attributeDirectory.resolveSnapshot("CATALOG_ITEM", input.catalogItemId(),
                businessDate, contexts);
        var mappings = mappingDirectory.resolve(tenantId, "CATALOG_ITEM", input.catalogItemId(),
                "INSURANCE", businessDate);

        ServiceRequest value = repository.saveAndFlush(new ServiceRequest(tenantId, encounter.residentId(),
                encounter.id(), numbers.next("service-request", new BusinessNumberContext(tenantId, performerOrganizationId, performerDepartmentId)), input.catalogItemId(), input.packageId(), performerOrganizationId,
                performerDepartmentId, encounter.organizationId(), encounter.departmentId(), businessDate, context.subjectId(), Strings.trimToNull(input.reason()), item.code(),
                item.name(), unitCode, adoption.localCode(), adoption.localName(), adoption.id(), adoption.revision(),
                main == null ? null : main.priceId(), main == null ? null : main.priceRevision(),
                main == null ? null : main.priceType(), main == null ? null : main.unitPrice(), totalAmount,
                main == null ? null : main.currencyCode(), jsonCodec.write(attributes.jsonItemAttrSnapshot()),
                attributes.hashItemAttrSnapshot(), attributes.resolvedAt(), jsonCodec.write(mappings),
                item.serviceType(), item.specimenType(), item.examinationType(),
                resolved.quantity(), Strings.trimToNull(input.clinicalDescription()), draft));
        saveSites(value, resolved.sites());
        saveChargeLines(value, resolved.chargeLines());
        if (!draft) publish(value, "SERVICE_REQUEST_AUTHORED", "开立诊疗项目",
                financialEventDetails(value, encounter, item.accountingCategory(), false));
        return value;
    }

    private void saveSites(ServiceRequest value, List<ExaminationSiteOption> sites) {
        for (int index = 0; index < sites.size(); index++) {
            siteRepository.save(new ServiceRequestSite(value.tenantId(), value.id(), index + 1, sites.get(index)));
        }
        siteRepository.flush();
    }

    private void saveChargeLines(ServiceRequest value, List<ServiceRequestChargeLine.PricedLine> lines) {
        for (int index = 0; index < lines.size(); index++) {
            chargeLineRepository.save(new ServiceRequestChargeLine(value.tenantId(), value.id(), index + 1, lines.get(index)));
        }
        chargeLineRepository.flush();
    }

    List<ServiceRequest> submittableDrafts(Long tenantId, Long encounterId) {
        return repository.findByTenantIdAndEncounterIdAndStatusOrderByAuthoredAtAscIdAsc(tenantId, encounterId,
                ServiceRequestStatus.DRAFT);
    }

    /** 开立草稿：发布与直接开立相同的开立事件，记账和执行科室任务只由此产生。 */
    ServiceRequestResponse activate(EncounterDirectory.EncounterSnapshot encounter, ServiceRequest value, long expectedRevision) {
        var item = catalogDirectory.resolve(value.tenantId(), value.catalogItemId(), value.performerOrganizationId(),
                null, value.priceType() == null ? "SALE" : value.priceType(), value.businessDate()).item();
        value.activate(expectedRevision, contextProvider.requireCurrent().subjectId());
        repository.flush();
        publish(value, "SERVICE_REQUEST_AUTHORED", "开立诊疗项目",
                financialEventDetails(value, encounter, item.accountingCategory(), false));
        return response(value);
    }

    @Transactional
    ServiceRequestResponse updateDocumentInfo(Long encounterId, Long id, UpdateOrderDocumentInfo input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        var value = repository.findByIdAndTenantId(id, encounter.tenantId())
                .filter(item -> item.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("ORDER_DOCUMENT_NOT_FOUND", "未找到本次就诊的单据"));
        if (!List.of("LABORATORY", "EXAMINATION").contains(value.serviceTypeSnapshot())) {
            throw conflict("ORDER_DOCUMENT_TYPE_INVALID", "当前仅支持检验检查申请单信息修改");
        }
        diagnosticDocuments.requireAmendable(encounter.tenantId(), id);
        String json = documentInfoSupport.validateAndWrite(encounter.tenantId(), encounterId,
                input.documentInfo(), false);
        var previousInfo = documentInfoSupport.read(value.documentInfoJson());
        value.updateDocumentInfo(input.expectedRevision(), json);
        repository.flush();
        publish(value, "ORDER_DOCUMENT_INFO_UPDATED", "修改单据信息", Map.of("updatedBy", contextProvider.requireCurrent().subjectId(),
                "before", previousInfo, "after", documentInfoSupport.read(json)));
        return response(value);
    }

    @Transactional
    List<ServiceRequestResponse> updateDocumentInfoBatch(Long encounterId, UpdateOrderDocumentInfoBatch input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        var memberIds = input.members().stream().map(UpdateOrderDocumentInfoBatch.Member::id).toList();
        if (new HashSet<>(memberIds).size() != memberIds.size()) {
            throw badRequest("ORDER_DOCUMENT_TARGET_DUPLICATED", "申请单项目重复，请重新选择");
        }
        // 先整体校验归属、类型与可修改状态，全部通过后再写入；任一版本冲突都会回滚整批。
        // 一次装载本批全部单据，避免逐条回查。
        Map<Long, ServiceRequest> valuesById = new HashMap<>();
        repository.findByTenantIdAndIdIn(encounter.tenantId(), memberIds)
                .forEach(value -> valuesById.put(value.id(), value));
        List<ServiceRequest> values = new ArrayList<>(memberIds.size());
        for (Long id : memberIds) {
            ServiceRequest value = valuesById.get(id);
            if (value == null || !value.encounterId().equals(encounterId)) {
                throw notFound("ORDER_DOCUMENT_NOT_FOUND", "未找到本次就诊的单据");
            }
            if (!List.of("LABORATORY", "EXAMINATION").contains(value.serviceTypeSnapshot())) {
                throw conflict("ORDER_DOCUMENT_TYPE_INVALID", "当前仅支持检验检查申请单信息修改");
            }
            diagnosticDocuments.requireAmendable(encounter.tenantId(), id);
            values.add(value);
        }
        String json = documentInfoSupport.validateAndWrite(encounter.tenantId(), encounterId, input.documentInfo(), false);
        var actorId = contextProvider.requireCurrent().subjectId();
        List<OrderDocumentInfo> previousInfos = new ArrayList<>(values.size());
        for (int index = 0; index < values.size(); index++) {
            var value = values.get(index);
            previousInfos.add(documentInfoSupport.read(value.documentInfoJson()));
            value.updateDocumentInfo(input.members().get(index).expectedRevision(), json);
        }
        repository.flush();
        List<ServiceRequestResponse> results = new ArrayList<>(values.size());
        for (int index = 0; index < values.size(); index++) {
            var value = values.get(index);
            results.add(response(value));
            publish(value, "ORDER_DOCUMENT_INFO_UPDATED", "修改单据信息", Map.of("updatedBy", actorId,
                    "before", previousInfos.get(index), "after", documentInfoSupport.read(json)));
        }
        return results;
    }

    @Transactional(readOnly = true)
    ExaminationSiteOptionsResponse examinationSites(Long encounterId, Long catalogItemId) {
        encounterDirectory.requireActiveForOrdering(encounterId);
        return examinationSites.siteRule(catalogItemId)
                .map(rule -> new ExaminationSiteOptionsResponse(catalogItemId, true, rule.bodySiteRequired(),
                        rule.multiBodySite(), rule.maxBodySiteCount(), rule.sitePricingMode(), rule.maxChargeableSiteCount(),
                        rule.sites().stream().map(site -> new ExaminationSiteOptionsResponse.ExaminationSiteChoice(
                                site.code(), site.name(), site.methodType(), site.chargeableSiteUnits())).toList()))
                .orElseGet(() -> new ExaminationSiteOptionsResponse(catalogItemId, false, false, false, null, null, null, List.of()));
    }

    @Transactional(readOnly = true)
    List<ServiceRequestResponse> list(Long encounterId) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        return repository.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(encounter.tenantId(), encounterId)
                .stream().collect(java.util.stream.Collectors.collectingAndThen(
                        java.util.stream.Collectors.toList(), this::responses));
    }

    ServiceRequest requireOwned(Long tenantId, Long encounterId, Long requestId) {
        return repository.findByIdAndTenantId(requestId, tenantId)
                .filter(request -> request.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
    }

    /** 取消签署：须未进结算单、执行科室未开始；撤回事件通知收费作废记账、执行科室删除未开始的任务。 */
    @Transactional
    ServiceRequestResponse withdrawSignature(Long encounterId, Long requestId, long expectedRevision) {
        var encounter = encounterDirectory.lockActiveForOrdering(encounterId);
        ServiceRequest value = requireOwned(encounter.tenantId(), encounterId, requestId);
        if (value.status() == ServiceRequestStatus.ACTIVE) {
            cancellationPolicy.requireWithdrawable(fulfillmentRef(value), "SERVICE_REQUEST_WITHDRAW_BLOCKED");
        }
        value.withdrawSignature(expectedRevision);
        repository.flush();
        publish(value, "SERVICE_REQUEST_WITHDRAWN", "取消签署诊疗项目", financialEventDetails(value, encounter, null, false));
        return response(value);
    }

    /** 未签署申请原地修改数量与临床说明；不能更换项目。 */
    ServiceRequestResponse reviseDraft(ServiceRequest value, long expectedRevision, CreateServiceRequest input) {
        if (!value.catalogItemId().equals(input.catalogItemId())) {
            throw badRequest("SERVICE_REQUEST_REVISION_ITEM_CHANGED", "修改不能更换项目，请删除后重新开立");
        }
        SiteSelection selection = selectSites(value.catalogItemId(), value.itemNameSnapshot(), value.serviceTypeSnapshot(), input.sites(), input.quantity());
        String priceType = value.priceType() == null ? "SALE" : value.priceType();
        var plan = value.unitPrice() == null ? null : examinationPlan(value.serviceTypeSnapshot(), value.catalogItemId(), selection);
        List<ServiceRequestChargeLine.PricedLine> chargeLines;
        if (substitutesMainLine(plan, value.catalogItemId())) {
            // 部位变化可能换档：主收费行与其余明细全部按开立时的执行机构、价格类型和业务日期重新取价。
            chargeLines = chargeLines(plan, null, true, value.performerOrganizationId(), priceType, value.businessDate());
            var main = chargeLines.getFirst();
            value.repriceMainLine(main.priceId(), main.priceRevision(), main.priceType(), main.unitPrice());
        } else {
            chargeLines = plan == null ? List.of() : chargeLines(plan, new ServiceRequestChargeLine.PricedLine("BASE_SERVICE",
                    value.catalogItemId(), value.itemCodeSnapshot(), value.itemNameSnapshot(), value.unitCodeSnapshot(),
                    selection.quantity(), value.priceId(), value.priceRevision(), value.priceType(), value.unitPrice(),
                    value.unitPrice().multiply(selection.quantity()), value.currencyCode(),
                    catalogDirectory.resolve(value.tenantId(), value.catalogItemId(), value.performerOrganizationId(), null,
                            priceType, value.businessDate()).item().accountingCategory()),
                    false, value.performerOrganizationId(), priceType, value.businessDate());
        }
        value.reviseDraft(expectedRevision, selection.quantity(), Strings.trimToNull(input.clinicalDescription()),
                chargeLines.isEmpty() ? null : sum(chargeLines));
        repository.flush();
        siteRepository.deleteAllInBatch(siteRepository.findByTenantIdAndRequestIdOrderByLineNoAsc(value.tenantId(), value.id()));
        saveSites(value, selection.sites());
        chargeLineRepository.deleteAllInBatch(chargeLineRepository.findByTenantIdAndRequestIdOrderByLineNoAsc(value.tenantId(), value.id()));
        saveChargeLines(value, chargeLines);
        publish(value, "SERVICE_REQUEST_DRAFT_REVISED", "修改未签署诊疗项目", Map.of("quantity", value.quantity(),
                "bodySiteCodes", selection.sites().stream().map(ExaminationSiteOption::code).toList()));
        return response(value);
    }

    @Transactional
    ServiceRequestResponse cancel(Long encounterId, Long requestId, CancelServiceRequest input) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByIdAndTenantId(requestId, encounter.tenantId())
                .filter(request -> request.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        boolean draft = value.status() == ServiceRequestStatus.DRAFT;
        if (value.status() == ServiceRequestStatus.ACTIVE) {
            cancellationPolicy.requireCancellable(fulfillmentRef(value), "SERVICE_REQUEST_CANCEL_BLOCKED");
        }
        value.cancel(input.expectedRevision(), input.reason().trim(), context.subjectId());
        repository.flush();
        // 草稿撤销的计费结论为 DRAFT：收费不冲销，执行科室没有任务可取消。
        Map<String, Object> eventDetails = financialEventDetails(value, encounter, null, draft);
        eventDetails.put("reason", input.reason().trim());
        eventDetails.put("cancelledBy", context.subjectId());
        publish(value, "SERVICE_REQUEST_CANCELLED", "撤销诊疗项目", eventDetails);
        return response(value);
    }

    private List<ServiceRequestResponse> responses(List<ServiceRequest> values) {
        var documentIds = values.stream().map(ServiceRequest::documentId).filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.toSet());
        Map<Long, String> documentNos = documentIds.isEmpty() || values.isEmpty() ? Map.of()
                : documentRepository.findByTenantIdAndIdIn(values.getFirst().tenantId(), documentIds).stream()
                .collect(java.util.stream.Collectors.toMap(ServiceDocument::id, ServiceDocument::documentNo));
        Map<Long, List<ServiceRequestResponse.RequestBodySite>> sites = values.isEmpty() ? Map.of()
                : siteRepository.findByTenantIdAndRequestIdInOrderByRequestIdAscLineNoAsc(values.getFirst().tenantId(),
                        values.stream().map(ServiceRequest::id).toList()).stream()
                .collect(java.util.stream.Collectors.groupingBy(ServiceRequestSite::requestId,
                        java.util.stream.Collectors.mapping(ServiceRequestService::bodySite, java.util.stream.Collectors.toList())));
        return values.stream().map(value -> response(value, documentNos, sites.getOrDefault(value.id(), List.of()))).toList();
    }

    private static ServiceRequestResponse.RequestBodySite bodySite(ServiceRequestSite site) {
        return new ServiceRequestResponse.RequestBodySite(site.code(), site.name(), site.methodType(), site.mutualRecognitionCode());
    }

    private ServiceRequestResponse response(ServiceRequest value) {
        return responses(List.of(value)).getFirst();
    }

    private ServiceRequestResponse response(ServiceRequest value, Map<Long, String> documentNos,
                                            List<ServiceRequestResponse.RequestBodySite> bodySites) {
        String cancelBlockedReason = value.status() == ServiceRequestStatus.ACTIVE
                ? cancellationPolicy.blockedReason(fulfillmentRef(value)) : null;
        return new ServiceRequestResponse(value.id(), value.revision(), value.residentId(), value.encounterId(),
                value.requestNo(), value.status().name(), value.catalogItemId(), value.packageId(),
                value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.itemCodeSnapshot(),
                value.itemNameSnapshot(), value.unitCodeSnapshot(), value.localCodeSnapshot(),
                value.localNameSnapshot(), value.adoptionId(), value.adoptionRevision(), value.priceId(),
                value.priceRevision(), value.priceType(), value.quantity(), value.unitPrice(), value.totalAmount(),
                value.currencyCode(), jsonCodec.readTree(value.itemAttributeSnapshot()), value.itemAttributeHash(),
                value.itemAttributeResolvedAt(), jsonCodec.readTree(value.standardMappingSnapshot()),
                value.serviceTypeSnapshot(), value.specimenTypeSnapshot(), value.examinationTypeSnapshot(),
                value.clinicalDescription(), value.cancelledAt(), value.cancelledBy(), value.cancelReason(),
                documentInfoSupport.read(value.documentInfoJson()),
                List.of("LABORATORY", "EXAMINATION").contains(value.serviceTypeSnapshot())
                        && (value.status() == ServiceRequestStatus.DRAFT || value.status() == ServiceRequestStatus.ACTIVE
                        && diagnosticDocuments.isAmendable(value.tenantId(), value.id())),
                cancelBlockedReason,
                cancellationPolicy.editBlockedReason(value.status() == ServiceRequestStatus.CANCELLED,
                        value.status() == ServiceRequestStatus.ACTIVE ? fulfillmentRef(value) : null),
                value.documentId(), value.documentId() == null ? null : documentNos.get(value.documentId()),
                List.copyOf(bodySites));
    }

    /** 草稿只属于开立医生，执行科室与外部接口按不存在处理。 */
    private static boolean issued(ServiceRequest value) {
        return value.status() != ServiceRequestStatus.DRAFT;
    }

    private static OrderFulfillmentGuard.OrderRef fulfillmentRef(ServiceRequest value) {
        return OrderFulfillmentGuard.OrderRef.service(value.tenantId(), value.id(), value.serviceTypeSnapshot());
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceRequestSnapshot requireForDiagnosticExchange(Long requestId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByIdAndTenantId(requestId, context.tenantId())
                .filter(ServiceRequestService::issued)
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        if (!context.canAccessOrganization(value.performerOrganizationId())
                || !context.canAccessDepartment(value.performerDepartmentId())) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "SERVICE_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的诊疗请求");
        }
        return snapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceRequestSnapshot requireForDiagnosticExchange(String requestNo) {
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByTenantIdAndPerformerOrganizationIdAndRequestNo(context.tenantId(), context.organizationId(), requestNo)
                .filter(ServiceRequestService::issued)
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        if (!context.canAccessOrganization(value.performerOrganizationId())
                || !context.canAccessDepartment(value.performerDepartmentId())) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "SERVICE_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的诊疗请求");
        }
        return snapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, ServiceRequestSnapshot> forDiagnosticExchange(Collection<Long> requestIds) {
        Map<Long, ServiceRequestSnapshot> result = new LinkedHashMap<>();
        if (requestIds == null || requestIds.isEmpty()) return result;
        ExecutionContext context = contextProvider.requireCurrent();
        List<Long> ids = requestIds.stream().filter(Objects::nonNull).distinct().toList();
        // 一次批量装载诊疗请求与部位行，避免逐请求回查；缺失或不可见的请求仍走单条以保持 404/403 语义。
        Map<Long, ServiceRequest> byId = new HashMap<>();
        List<ServiceRequest> values = new ArrayList<>();
        for (int from = 0; from < ids.size(); from += 500) {
            repository.findByTenantIdAndIdIn(context.tenantId(), ids.subList(from, Math.min(from + 500, ids.size())))
                    .forEach(value -> byId.putIfAbsent(value.id(), value));
        }
        List<Long> issuedIds = new ArrayList<>();
        for (Long id : ids) {
            ServiceRequest value = byId.get(id);
            if (value == null || !issued(value)) {
                requireForDiagnosticExchange(id);
                continue;
            }
            if (!context.canAccessOrganization(value.performerOrganizationId())
                    || !context.canAccessDepartment(value.performerDepartmentId())) {
                throw com.rhn.shared.api.BusinessErrors.forbidden(
                        "SERVICE_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的诊疗请求");
            }
            values.add(value);
            issuedIds.add(id);
        }
        Map<Long, List<ServiceRequestSite>> sitesByRequest = new HashMap<>();
        for (int from = 0; from < issuedIds.size(); from += 500) {
            siteRepository.findByTenantIdAndRequestIdInOrderByRequestIdAscLineNoAsc(context.tenantId(),
                            issuedIds.subList(from, Math.min(from + 500, issuedIds.size())))
                    .forEach(value -> sitesByRequest.computeIfAbsent(value.requestId(),
                            ignored -> new ArrayList<>()).add(value));
        }
        for (ServiceRequest value : values) {
            result.put(value.id(), snapshot(value, sitesByRequest.getOrDefault(value.id(), List.of())));
        }
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ServiceRequestSnapshot> activeForExecution(Long organizationId, Long departmentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.canAccessOrganization(organizationId) || !context.canAccessDepartment(departmentId)) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "SERVICE_REQUEST_EXECUTION_SCOPE_INVALID", "无权读取当前工作上下文之外的诊疗请求");
        }
        return repository.findActiveForExecution(context.tenantId(), organizationId, departmentId)
                .stream().map(this::snapshot).toList();
    }

    private ServiceRequestSnapshot snapshot(ServiceRequest value) {
        return snapshot(value,
                siteRepository.findByTenantIdAndRequestIdOrderByLineNoAsc(value.tenantId(), value.id()));
    }

    private ServiceRequestSnapshot snapshot(ServiceRequest value, List<ServiceRequestSite> sites) {
        return new ServiceRequestSnapshot(value.id(), value.revision(), value.tenantId(), value.residentId(),
                value.encounterId(), value.requestNo(), value.status().name(), value.serviceTypeSnapshot(),
                value.catalogItemId(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                value.localCodeSnapshot(), value.localNameSnapshot(), value.specimenTypeSnapshot(),
                value.examinationTypeSnapshot(), value.quantity(), value.unitCodeSnapshot(),
                value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.clinicalDescription(),
                value.totalAmount(), value.currencyCode(),
                value.itemAttributeHash(), value.itemAttributeSnapshot(), value.standardMappingSnapshot(),
                documentInfoSupport.read(value.documentInfoJson()).examinationPurpose(),
                Strings.trimToNull(sites.stream()
                        .map(ServiceRequestSite::name).collect(java.util.stream.Collectors.joining("、"))));
    }

    private void publish(ServiceRequest value, String type, String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details);
        payload.put("requestNo", value.requestNo());
        payload.put("summary", summary);
        Instant occurredAt = switch (type) {
            case "SERVICE_REQUEST_AUTHORED" -> value.authoredAt();
            case "SERVICE_REQUEST_CANCELLED" -> value.cancelledAt();
            default -> Instant.now();
        };
        eventPublisher.publish(value.tenantId(), value.performerOrganizationId(), type,
                details.containsKey("billingDisposition") ? 2 : 1,
                "ServiceRequest", value.id(), value.revision(), value.residentId(), occurredAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS), payload);
    }

    private Map<String, Object> financialEventDetails(ServiceRequest value,
                                                       EncounterDirectory.EncounterSnapshot encounter,
                                                       String explicitCategory, boolean draft) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("billingDisposition", com.rhn.outpatient.api.ClinicalOrderBillingDisposition.fromSnapshot(
                draft, false, value.unitPrice(), value.totalAmount(), value.currencyCode()).name());
        details.put("encounterId", encounter.id());
        details.put("residentId", encounter.residentId());
        details.put("encounterOrganizationId", encounter.organizationId());
        details.put("encounterDepartmentId", encounter.departmentId());
        details.put("catalogItemId", value.catalogItemId());
        details.put("serviceType", value.serviceTypeSnapshot());
        String category = Strings.trimToNull(explicitCategory);
        if (category != null) details.put("accountingCategory", category);
        details.put("performerDepartmentId", value.performerDepartmentId());
        if (value.specimenTypeSnapshot() != null) details.put("specimenType", value.specimenTypeSnapshot());
        if (value.examinationTypeSnapshot() != null) details.put("examinationType", value.examinationTypeSnapshot());
        details.put("authoredBy", value.authoredBy());
        details.put("chargeQuantity", value.quantity());
        List<ServiceRequestSite> sites = siteRepository.findByTenantIdAndRequestIdOrderByLineNoAsc(value.tenantId(), value.id());
        if (!sites.isEmpty()) details.put("bodySites", sites.stream().map(site -> Map.of(
                "code", site.code(), "name", site.name())).toList());
        details.put("chargeUnit", value.unitCodeSnapshot());
        details.put("itemCode", value.itemCodeSnapshot());
        details.put("itemName", value.itemNameSnapshot());
        if (value.priceId() != null) details.put("priceId", value.priceId());
        if (value.priceRevision() != null) details.put("priceRevision", value.priceRevision());
        if (value.priceType() != null) details.put("priceType", value.priceType());
        if (value.unitPrice() != null) details.put("unitPrice", value.unitPrice());
        if (value.totalAmount() != null) details.put("totalAmount", value.totalAmount());
        if (value.currencyCode() != null) details.put("currencyCode", value.currencyCode());
        List<ServiceRequestChargeLine> chargeLines = chargeLineRepository.findByTenantIdAndRequestIdOrderByLineNoAsc(
                value.tenantId(), value.id());
        if (!chargeLines.isEmpty()) details.put("chargeLines", chargeLines.stream().map(ServiceRequestChargeLine::eventFact).toList());
        return details;
    }


}
