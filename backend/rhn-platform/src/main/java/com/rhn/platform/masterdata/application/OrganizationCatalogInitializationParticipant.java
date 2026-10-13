package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.domain.CatalogPrice;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.infrastructure.CatalogPriceRepository;
import com.rhn.platform.masterdata.infrastructure.ItemPackageRepository;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceParticipant;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Organization adoption and prices use the established lifecycle commands, not direct table inserts. */
@Component
public class OrganizationCatalogInitializationParticipant implements MaintenanceParticipant {
    static final List<String> HEADERS = List.of("目录编码", "默认科室编码", "本地编码", "本地名称", "可开立", "可执行",
            "可收费", "可采购", "库存管理", "可发药", "可退药", "价格类型", "价格", "包装条码", "生效日期", "失效日期");
    private final MasterDataImportFileParser parser;
    private final CatalogCommandValidation validation;
    private final CatalogLifecycleService lifecycle;
    private final OrganizationCatalogItemRepository adoptions;
    private final CatalogPriceRepository prices;
    private final ItemPackageRepository packages;
    private final OrganizationDirectory organizations;
    private final JdbcTemplate jdbc;
    private final JsonCodec json;

    OrganizationCatalogInitializationParticipant(MasterDataImportFileParser parser, CatalogCommandValidation validation,
            CatalogLifecycleService lifecycle, OrganizationCatalogItemRepository adoptions,
            CatalogPriceRepository prices, ItemPackageRepository packages, OrganizationDirectory organizations,
            JdbcTemplate jdbc, JsonCodec json) {
        this.parser = parser; this.validation = validation; this.lifecycle = lifecycle; this.adoptions = adoptions;
        this.prices = prices; this.packages = packages; this.organizations = organizations; this.jdbc = jdbc; this.json = json;
    }
    @Override public Dataset dataset() {
        return new Dataset("ORGANIZATION_CATALOG", "机构目录及价格导入", Set.of(Operation.IMPORT_CATALOG),
                Set.of("MASTER_DATA"), "1");
    }
    public byte[] template(String format) { return parser.template("机构目录初始化", format, HEADERS); }
    @Override public void validateTestRoots(ExecutionContext actor, Scope scope, List<Root> roots, String evidence) {
        throw badRequest("MAINTENANCE_BATCH_UNSUPPORTED", "机构目录导入不登记测试业务批次");
    }
    @Override public PreparedChange preview(ExecutionContext actor, Scope scope, Operation operation,
                                           Set<String> modules, List<Root> roots, String inputJson) {
        authorize(actor, scope);
        Input input = json.read(inputJson, Input.class);
        if (input.contentBase64() == null || input.fileName() == null)
            throw badRequest("CATALOG_INITIALIZATION_FILE_REQUIRED", "请选择机构目录 CSV 或 XLSX 文件");
        byte[] content;
        try { content = Base64.getDecoder().decode(input.contentBase64()); }
        catch (IllegalArgumentException error) { throw badRequest("CATALOG_INITIALIZATION_FILE_INVALID", "导入文件编码不正确"); }
        var source = parser.parse(input.fileName(), content);
        List<Row> rows = new ArrayList<>();
        List<Issue> errors = new ArrayList<>();
        for (Long organization : scope.organizationIds()) {
            var seen = new HashSet<String>();
            for (var raw : source) {
                try {
                    Row row = map(actor, organization, raw.rowNumber(), raw.values());
                    String dimension = row.catalogItemId() + "/" + (row.price() == null ? "ADOPTION"
                            : row.price().packageId() + "/" + row.price().priceType());
                    if (!seen.add(dimension)) throw badRequest("CATALOG_INITIALIZATION_DUPLICATE", "文件中重复维护相同目录/计价范围");
                    rows.add(row);
                } catch (BusinessException | IllegalArgumentException error) {
                    String code = error instanceof BusinessException business ? business.code() : "CATALOG_INITIALIZATION_ROW_INVALID";
                    errors.add(new Issue(code, "机构 " + organizations.requireOrganization(scope.tenantId(), organization).name()
                            + " 第 " + raw.rowNumber() + " 行：" + error.getMessage(), "MASTER_DATA"));
                }
            }
        }
        // Repeated price rows for one item must agree on its adoption capabilities.
        Map<String, CatalogLifecycleService.AdoptionInput> capabilities = new HashMap<>();
        for (Row row : rows) {
            var previous = capabilities.putIfAbsent(row.organizationId() + "/" + row.catalogItemId(), row.adoption());
            if (previous != null && !previous.equals(row.adoption()))
                errors.add(new Issue("CATALOG_INITIALIZATION_CAPABILITY_CONFLICT",
                        "第 " + row.rowNumber() + " 行与同一目录项目的机构能力配置不一致", "MASTER_DATA"));
        }
        long createAdoptions = rows.stream().filter(row -> row.existingAdoptionId() == null)
                .map(row -> row.organizationId() + "/" + row.catalogItemId()).distinct().count();
        long createPrices = rows.stream().filter(row -> row.price() != null && row.existingPriceId() == null).count();
        long preserved = rows.stream().filter(row -> row.existingAdoptionId() != null).count()
                + rows.stream().filter(row -> row.price() != null && row.existingPriceId() != null).count();
        return new PreparedChange(json.write(new Plan(rows)),
                List.of(new Impact("MASTER_DATA", "新增机构目录启用", createAdoptions, createAdoptions, "CREATE"),
                        new Impact("MASTER_DATA", "新增机构价格", createPrices, createPrices, "CREATE"),
                        new Impact("MASTER_DATA", "已有机构目录和价格", preserved, preserved, "KEEP")),
                errors, List.of("已有目录能力与价格版本", "基础项目和药品目录", "其他机构目录", "机构目录来源关系"),
                rows.stream().map(row -> new PreviewLine("MASTER_DATA", row.organizationId(), row.item().code(), row.item().name(),
                        row.existingAdoptionId() == null || row.price() != null && row.existingPriceId() == null ? "CREATE" : "KEEP",
                        row.existingPriceId() == null ? null : prices.findByIdAndTenantId(row.existingPriceId(), actor.tenantId())
                                .map(value -> value.price().toPlainString() + " " + value.currencyCode()).orElse(null),
                        row.price() == null ? "机构目录启用" : row.existingPriceId() != null ? "保留已有价格"
                                : row.price().price().toPlainString() + " " + row.price().currencyCode(),
                        row.existingAdoptionId() == null ? "补齐机构目录；已有计价范围保留" : "已有机构目录保留；仅补缺价格", row.rowNumber())).toList());
    }
    private Row map(ExecutionContext actor, Long org, int line, Map<String, String> source) {
        String code = required(source, "目录编码");
        Item item = jdbc.query("select ID_CATALOG_ITEM,CD_CATALOG_ITEM,NA_CATALOG_ITEM,SD_ITEM_TYPE,SD_STATUS,REVISION,"
                        + "DA_VALID_FROM,DA_VALID_TO from RHN_BD_CATALOG_ITEM where ID_TNT=? and CD_CATALOG_ITEM=?",
                (rs, row) -> new Item(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getLong(6), rs.getObject(7, LocalDate.class), rs.getObject(8, LocalDate.class)),
                actor.tenantId(), code).stream().findFirst().orElseThrow(() ->
                        badRequest("CATALOG_INITIALIZATION_ITEM_UNKNOWN", "目录编码不存在，请先在基础目录建档：" + code));
        if (!Set.of("SERVICE", "MED_PRODUCT", "SUPPLY").contains(item.type()))
            throw badRequest("CATALOG_INITIALIZATION_ITEM_TYPE", "该项目类型不支持机构目录初始化");
        LocalDate from = LocalDate.parse(required(source, "生效日期"));
        LocalDate to = text(source, "失效日期") == null ? null : LocalDate.parse(text(source, "失效日期"));
        if (to != null && to.isBefore(from)) throw badRequest("CATALOG_INITIALIZATION_PERIOD", "失效日期不能早于生效日期");
        if (!"ACTIVE".equals(item.status()) || item.validFrom().isAfter(from)
                || item.validTo() != null && item.validTo().isBefore(from))
            throw badRequest("CATALOG_INITIALIZATION_ITEM_INACTIVE", "目录项目在生效日期不可用");
        String departmentCode = text(source, "默认科室编码");
        Long department = departmentCode == null ? null : organizations.listDepartments(actor.tenantId(), org).stream()
                .filter(value -> departmentCode.equals(value.code()) && "ACTIVE".equals(value.sdOrgStatus()))
                .findFirst().orElseThrow(() -> badRequest("CATALOG_INITIALIZATION_DEPARTMENT_UNKNOWN", "默认科室不属于目标机构或未启用")).id();
        var adoption = new CatalogLifecycleService.AdoptionInput(org, department, text(source, "本地编码"), text(source, "本地名称"),
                flag(source, "可开立"), flag(source, "可执行"), flag(source, "可收费"), flag(source, "可采购"),
                flag(source, "库存管理"), flag(source, "可发药"), flag(source, "可退药"), "ACTIVE", from, to);
        OrganizationCatalogItem existing = adoptions.findFirstByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                actor.tenantId(), org, item.id()).orElse(null);
        CatalogLifecycleService.PriceInput price = null;
        CatalogPrice existingPrice = null;
        if (text(source, "价格") != null) {
            BigDecimal amount = new BigDecimal(text(source, "价格"));
            if (amount.signum() < 0 || amount.scale() > 6 || amount.precision() - amount.scale() > 18)
                throw badRequest("CATALOG_INITIALIZATION_PRICE_INVALID", "价格需非负，最多18位整数和6位小数");
            String type = required(source, "价格类型");
            validation.requireCode(MasterDataDictionaryCodes.PRICE_TYPE, type);
            String barcode = text(source, "包装条码");
            Long packaging = barcode == null ? null : packages
                    .findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscQuantityFactorAsc(actor.tenantId(), List.of(item.id()))
                    .stream().filter(value -> barcode.equals(value.barcode()) && "ACTIVE".equals(value.status()))
                    .findFirst().orElseThrow(() -> badRequest("CATALOG_INITIALIZATION_PACKAGE_INVALID", "包装条码不属于该目录项目或未启用")).id();
            if ("MED_PRODUCT".equals(item.type()) && packaging == null)
                throw badRequest("CATALOG_INITIALIZATION_PACKAGE_REQUIRED", "药品价格需填写计价包装条码");
            price = new CatalogLifecycleService.PriceInput(org, packaging, type, amount, "CNY", null,
                    "上线前机构目录导入", from, to, "ACTIVE");
            Long packageId = packaging;
            existingPrice = prices.findByTenantIdAndCatalogItemIdOrderByValidFromDesc(actor.tenantId(), item.id()).stream()
                    .filter(value -> value.sameScope(org, packageId, type)).findFirst().orElse(null);
        } else if (text(source, "价格类型") != null || text(source, "包装条码") != null) {
            throw badRequest("CATALOG_INITIALIZATION_PRICE_REQUIRED", "填写计价范围时还需填写价格");
        }
        return new Row(line, org, item.id(), item, adoption, price, existing == null ? null : existing.id(),
                existing == null ? null : existing.revision(), existingPrice == null ? null : existingPrice.id(),
                existingPrice == null ? null : existingPrice.revision());
    }
    @Override public String backup(ExecutionContext actor, Scope scope, PreparedChange change) { return change.payloadJson(); }
    @Override public void apply(ExecutionContext actor, Scope scope, PreparedChange change) {
        authorize(actor, scope);
        Set<String> created = new HashSet<>();
        for (Row row : json.read(change.payloadJson(), Plan.class).rows()) {
            if (row.existingAdoptionId() == null && created.add(row.organizationId() + "/" + row.catalogItemId()))
                lifecycle.createAdoption(row.catalogItemId(), row.adoption());
            if (row.price() != null && row.existingPriceId() == null) lifecycle.createPrice(row.catalogItemId(), row.price());
        }
        adoptions.flush(); prices.flush();
    }
    @Override public void verify(ExecutionContext actor, Scope scope, PreparedChange change) {
        for (Row row : json.read(change.payloadJson(), Plan.class).rows()) {
            var adoption = adoptions.findFirstByTenantIdAndOrganizationIdAndCatalogItemIdOrderByValidFromDesc(
                    actor.tenantId(), row.organizationId(), row.catalogItemId()).orElseThrow(() ->
                    conflict("CATALOG_INITIALIZATION_VERIFY_FAILED", "机构目录启用结果缺失"));
            if (row.existingAdoptionId() != null && (!adoption.id().equals(row.existingAdoptionId())
                    || adoption.revision() != row.existingAdoptionRevision()))
                throw conflict("CATALOG_INITIALIZATION_PRESERVATION_FAILED", "已有机构目录版本发生变化");
            if (row.price() != null) {
                var actual = prices.findByTenantIdAndCatalogItemIdOrderByValidFromDesc(actor.tenantId(), row.catalogItemId()).stream()
                        .filter(value -> value.sameScope(row.organizationId(), row.price().packageId(), row.price().priceType()))
                        .findFirst().orElseThrow(() -> conflict("CATALOG_INITIALIZATION_VERIFY_FAILED", "机构价格结果缺失"));
                if (row.existingPriceId() == null && actual.price().compareTo(row.price().price()) != 0
                        || row.existingPriceId() != null && (!actual.id().equals(row.existingPriceId())
                        || actual.revision() != row.existingPriceRevision()))
                    throw conflict("CATALOG_INITIALIZATION_VERIFY_FAILED", "机构价格与预览或保留版本不一致");
            }
        }
    }
    @Override public void afterCommit(ExecutionContext actor, Scope scope, PreparedChange change) {
        // Lifecycle commands synchronize the existing catalog projection in their transaction.
    }
    private void authorize(ExecutionContext actor, Scope scope) {
        if (!actor.hasAuthority("MASTER_DATA.MANAGE") && (!actor.hasAuthority("ORG_CATALOG.MANAGE")
                || scope.organizationIds().stream().anyMatch(id -> !id.equals(actor.organizationId()))))
            throw forbidden("CATALOG_INITIALIZATION_FORBIDDEN", "需具有目标机构目录管理或中心主数据管理权限");
    }
    private String required(Map<String, String> row, String key) {
        String value = text(row, key);
        if (value == null) throw badRequest("CATALOG_INITIALIZATION_FIELD_REQUIRED", key + "不能为空");
        return value;
    }
    private String text(Map<String, String> row, String key) {
        String value = row.get(key);
        return value == null || value.isBlank() ? null : value.trim();
    }
    private boolean flag(Map<String, String> row, String key) {
        String value = text(row, key);
        if (value == null || Set.of("0", "false", "否").contains(value)) return false;
        if (Set.of("1", "true", "是").contains(value)) return true;
        throw badRequest("CATALOG_INITIALIZATION_FLAG_INVALID", key + "仅支持是/否、true/false或1/0");
    }
    public record Input(String fileName, String contentBase64) {}
    public record Item(Long id, String code, String name, String type, String status, long revision,
                       LocalDate validFrom, LocalDate validTo) {}
    public record Row(int rowNumber, Long organizationId, Long catalogItemId, Item item,
                      CatalogLifecycleService.AdoptionInput adoption, CatalogLifecycleService.PriceInput price,
                      Long existingAdoptionId, Long existingAdoptionRevision, Long existingPriceId, Long existingPriceRevision) {}
    public record Plan(List<Row> rows) {}
}
