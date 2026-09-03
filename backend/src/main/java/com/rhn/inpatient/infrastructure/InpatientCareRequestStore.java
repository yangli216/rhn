package com.rhn.inpatient.infrastructure;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** Writes the shared CareRequest fact and its existing medication/service subtype. */
@Component
public class InpatientCareRequestStore {
    private static final String EMPTY_JSON_HASH =
            "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";

    private final CatalogLifecycleDirectory catalogDirectory;
    private final ItemAttributeSnapshotDirectory attributeDirectory;
    private final ItemStandardMappingDirectory mappingDirectory;
    private final MedicationRouteDirectory routeDirectory;
    private final JsonCodec jsonCodec;
    private final NamedParameterJdbcTemplate jdbc;

    public InpatientCareRequestStore(CatalogLifecycleDirectory catalogDirectory,
                                     ItemAttributeSnapshotDirectory attributeDirectory,
                                     ItemStandardMappingDirectory mappingDirectory,
                                     MedicationRouteDirectory routeDirectory,
                                     JsonCodec jsonCodec,
                                     JdbcTemplate jdbcTemplate) {
        this.catalogDirectory = catalogDirectory;
        this.attributeDirectory = attributeDirectory;
        this.mappingDirectory = mappingDirectory;
        this.routeDirectory = routeDirectory;
        this.jsonCodec = jsonCodec;
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    public Long create(CreateFact input) {
        Long requestId = GlobalIds.next();
        Instant now = Instant.now();
        LocalDate businessDate = LocalDate.now();
        ResolvedItem resolved = resolve(input, businessDate);
        String requestKind = "NURSING".equals(input.orderCategory()) ? "CARE_ACTIVITY" : input.orderCategory();
        Long performerDepartmentId = "SERVICE".equals(input.orderCategory())
                && resolved.defaultDepartmentId() != null
                ? resolved.defaultDepartmentId() : input.departmentId();

        MapSqlParameterSource values = new MapSqlParameterSource()
                .addValue("id", requestId).addValue("tenantId", input.tenantId())
                .addValue("residentId", input.residentId()).addValue("encounterId", input.encounterId())
                .addValue("requestNo", nextRequestNo()).addValue("requestKind", requestKind)
                .addValue("catalogItemId", resolved.catalogItemId()).addValue("organizationId", input.organizationId())
                .addValue("departmentId", performerDepartmentId).addValue("businessDate", businessDate)
                .addValue("authoredAt", now.atOffset(ZoneOffset.UTC), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("actorId", input.actorId())
                .addValue("reason", trim(input.instructions())).addValue("itemCode", resolved.itemCode())
                .addValue("itemName", resolved.itemName()).addValue("unitCode", resolved.unitCode())
                .addValue("localCode", resolved.localCode()).addValue("localName", resolved.localName())
                .addValue("adoptionId", resolved.adoptionId()).addValue("adoptionRevision", resolved.adoptionRevision())
                .addValue("priceId", resolved.priceId()).addValue("priceRevision", resolved.priceRevision())
                .addValue("priceType", resolved.priceType()).addValue("unitPrice", resolved.unitPrice())
                .addValue("totalAmount", resolved.unitPrice()).addValue("currencyCode", resolved.currencyCode())
                .addValue("attributeSnapshot", resolved.attributeSnapshot()).addValue("attributeHash", resolved.attributeHash())
                .addValue("attributeResolvedAt", resolved.attributeResolvedAt().atOffset(ZoneOffset.UTC),
                        Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("mappingSnapshot", resolved.mappingSnapshot());
        jdbc.update("""
                insert into care_requests (
                    id, revision, tenant_id, resident_id, encounter_id, request_no, request_kind,
                    status, intent_code, priority_code, catalog_item_id, package_id,
                    performer_organization_id, performer_department_id, business_date, authored_at,
                    authored_by, reason_text, cancelled_at, cancelled_by, cancel_reason,
                    item_code_snapshot, item_name_snapshot, unit_code_snapshot,
                    local_code_snapshot, local_name_snapshot, adoption_id, adoption_revision,
                    price_id, price_revision, price_type, unit_price, total_amount, currency_code,
                    item_attribute_snapshot, item_attribute_hash, item_attribute_resolved_at,
                    standard_mapping_snapshot
                ) values (
                    :id, 0, :tenantId, :residentId, :encounterId, :requestNo, :requestKind,
                    'DRAFT', 'ORDER', 'ROUTINE', :catalogItemId, null,
                    :organizationId, :departmentId, :businessDate, :authoredAt,
                    :actorId, :reason, null, null, null,
                    :itemCode, :itemName, :unitCode,
                    :localCode, :localName, :adoptionId, :adoptionRevision,
                    :priceId, :priceRevision, :priceType, :unitPrice, :totalAmount, :currencyCode,
                    :attributeSnapshot, :attributeHash, :attributeResolvedAt, :mappingSnapshot
                )
                """, values);
        if ("MEDICATION".equals(input.orderCategory())) insertMedication(requestId, input, resolved, businessDate);
        if ("SERVICE".equals(input.orderCategory())) insertService(requestId, input, resolved);
        return requestId;
    }

    public RequestDetails details(Long tenantId, Long requestId, String orderCategory) {
        if (!"MEDICATION".equals(orderCategory)) return RequestDetails.EMPTY;
        List<RequestDetails> values = jdbc.query("""
                select medication_id, medication_code_snapshot, medication_name_snapshot,
                       dose_value, dose_unit, route_code, frequency_code, self_provided,
                       quantity, quantity_unit, base_quantity, base_unit
                  from medication_requests where tenant_id = :tenantId and request_id = :requestId
                """, new MapSqlParameterSource().addValue("tenantId", tenantId).addValue("requestId", requestId),
                (result, row) -> new RequestDetails(result.getLong(1), result.getString(2), result.getString(3),
                        result.getBigDecimal(4), result.getString(5), result.getString(6), result.getString(7),
                        result.getBoolean(8), result.getBigDecimal(9), result.getString(10),
                        result.getBigDecimal(11), result.getString(12)));
        return values.isEmpty() ? RequestDetails.EMPTY : values.getFirst();
    }

    public ServiceDetails serviceDetails(Long tenantId, Long requestId) {
        List<ServiceDetails> values = jdbc.query("""
                select service_type_snapshot, specimen_type_snapshot, examination_type_snapshot, quantity
                  from service_requests where tenant_id = :tenantId and request_id = :requestId
                """, new MapSqlParameterSource().addValue("tenantId", tenantId).addValue("requestId", requestId),
                (result, row) -> new ServiceDetails(result.getString(1), result.getString(2),
                        result.getString(3), result.getBigDecimal(4)));
        if (values.isEmpty()) {
            throw conflict("INPATIENT_SERVICE_REQUEST_MISSING", "住院诊疗医嘱明细不存在");
        }
        return values.getFirst();
    }

    private ResolvedItem resolve(CreateFact input, LocalDate businessDate) {
        if ("NURSING".equals(input.orderCategory()) && input.catalogItemId() == null) {
            String name = trim(input.itemName());
            if (name == null) throw badRequest("INPATIENT_NURSING_NAME_REQUIRED", "护理医嘱名称不能为空");
            String code = trim(input.itemCode());
            return new ResolvedItem(null, null, code == null ? "NURSING" : code, name, "次",
                    null, null, null, null, null, null, null, null, null, null,
                    "{}", EMPTY_JSON_HASH, Instant.now(), "[]", null, null, null, null);
        }
        if (input.catalogItemId() == null) {
            throw badRequest("INPATIENT_CATALOG_ITEM_REQUIRED", "药品或诊疗项目不能为空");
        }
        CatalogOperationalSnapshot catalog = catalogDirectory.resolve(input.tenantId(), input.catalogItemId(),
                input.organizationId(), null, "SALE", businessDate);
        var item = catalog.item();
        if (!"ACTIVE".equals(item.status()) || item.validFrom().isAfter(businessDate)
                || item.validTo() != null && item.validTo().isBefore(businessDate) || !item.orderable()) {
            throw conflict("INPATIENT_CATALOG_ITEM_UNAVAILABLE", "所选项目当前不可开立");
        }
        if (catalog.adoption() == null || !catalog.adoption().orderable()) {
            throw conflict("INPATIENT_CATALOG_NOT_ADOPTED", "当前机构尚未开放所选项目");
        }
        MedicationSnapshot medication = catalog.medication();
        if ("MEDICATION".equals(input.orderCategory())) {
            if (!"MED_PRODUCT".equals(item.itemType()) || medication == null || !"ACTIVE".equals(medication.status())) {
                throw badRequest("INPATIENT_MEDICATION_INVALID", "住院药品医嘱必须选择有效药品产品");
            }
        } else if (!"SERVICE".equals(item.itemType())) {
            throw badRequest("INPATIENT_SERVICE_INVALID", "诊疗或护理医嘱只能选择有效诊疗项目");
        }
        String subjectType = medication == null ? "CATALOG_ITEM" : "MEDICATION";
        Long targetId = medication == null ? item.id() : medication.id();
        var contexts = new ItemAttributeSnapshotDirectory.AttributeContexts(
                new ItemAttributeSnapshotDirectory.AttributeScope(input.organizationId(), input.departmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(input.organizationId(), input.departmentId()),
                medication == null ? null
                        : new ItemAttributeSnapshotDirectory.AttributeScope(input.organizationId(), input.departmentId()),
                null);
        var attributes = attributeDirectory.resolveSnapshot(subjectType, targetId, businessDate, contexts);
        var mappings = mappingDirectory.resolve(input.tenantId(), subjectType, targetId,
                medication == null ? "INSURANCE" : null, businessDate);
        var adoption = catalog.adoption();
        var price = catalog.price();
        return new ResolvedItem(item.id(), medication == null ? null : medication.id(), item.code(), item.name(),
                defaultText(item.unitCode(), medication == null ? "次" : defaultText(medication.preparationUnit(), "次")),
                adoption.localCode(), adoption.localName(), adoption.id(), adoption.revision(),
                adoption.defaultDepartmentId(),
                price == null ? null : price.id(), price == null ? null : price.revision(),
                price == null ? null : price.sdPriceType(), price == null ? null : price.price(),
                price == null ? null : price.currencyCode(),
                jsonCodec.write(attributes.jsonItemAttrSnapshot()), attributes.hashItemAttrSnapshot(),
                attributes.resolvedAt(), jsonCodec.write(mappings), medication,
                item.serviceType(), item.specimenType(), item.examinationType());
    }

    private void insertMedication(Long requestId, CreateFact input, ResolvedItem resolved, LocalDate businessDate) {
        MedicationSnapshot medication = resolved.medication();
        BigDecimal dose = input.dosageAmount() == null ? medication.defaultDose() : input.dosageAmount();
        String doseUnit = trim(input.dosageUnit()) == null ? medication.defaultDoseUnit() : trim(input.dosageUnit());
        if ((dose == null) != (doseUnit == null)) {
            throw badRequest("INPATIENT_MEDICATION_DOSE_INVALID", "单次剂量与剂量单位必须同时填写");
        }
        String route = normalize(input.routeCode() == null ? medication.defaultRoute() : input.routeCode());
        var routeSnapshot = routeDirectory.requireActive(input.tenantId(), route, "INPATIENT", businessDate);
        route = routeSnapshot.code();
        String frequency = normalize(input.frequencyCode() == null ? medication.defaultFrequency() : input.frequencyCode());
        MapSqlParameterSource values = new MapSqlParameterSource()
                .addValue("requestId", requestId).addValue("tenantId", input.tenantId())
                .addValue("medicationId", medication.id()).addValue("dose", dose).addValue("doseUnit", doseUnit)
                .addValue("routeId", routeSnapshot.id()).addValue("route", route)
                .addValue("routeName", routeSnapshot.name()).addValue("routeExecutionType", routeSnapshot.executionType())
                .addValue("frequency", frequency).addValue("unit", resolved.unitCode())
                .addValue("substitutionAllowed", Boolean.FALSE, Types.BOOLEAN)
                .addValue("selfProvided", Boolean.FALSE, Types.BOOLEAN)
                .addValue("instruction", trim(input.instructions())).addValue("medicationCode", medication.code())
                .addValue("medicationName", medication.name()).addValue("medicationType", medication.medicationType())
                .addValue("doseForm", medication.doseForm()).addValue("spec", medication.preparationSpec())
                .addValue("preparationUnit", medication.preparationUnit())
                .addValue("skinTest", medication.skinTestRequired()).addValue("antimicrobial", medication.antimicrobial())
                .addValue("antimicrobialLevel", medication.antimicrobialLevel())
                .addValue("snapshot", jsonCodec.write(medication));
        jdbc.update("""
                insert into medication_requests (
                    request_id, tenant_id, medication_id, dose_value, dose_unit,
                    route_id, route_code, route_name_snapshot, route_execution_type_snapshot, route_resolution_status,
                    frequency_code,
                    quantity, quantity_unit, base_quantity, base_unit, package_factor_snapshot,
                    substitution_allowed, self_provided, medication_instruction,
                    medication_code_snapshot, medication_name_snapshot, medication_type_snapshot,
                    dose_form_snapshot, preparation_spec_snapshot, preparation_unit_snapshot,
                    skin_test_required_snapshot, antimicrobial_snapshot, antimicrobial_level_snapshot,
                    medication_snapshot
                ) values (
                    :requestId, :tenantId, :medicationId, :dose, :doseUnit,
                    :routeId, :route, :routeName, :routeExecutionType, 'RESOLVED', :frequency,
                    1, :unit, 1, :unit, 1, :substitutionAllowed, :selfProvided, :instruction,
                    :medicationCode, :medicationName, :medicationType,
                    :doseForm, :spec, :preparationUnit, :skinTest, :antimicrobial,
                    :antimicrobialLevel, :snapshot
                )
                """, values);
    }

    private void insertService(Long requestId, CreateFact input, ResolvedItem resolved) {
        jdbc.update("""
                insert into service_requests (
                    request_id, tenant_id, service_type_snapshot, specimen_type_snapshot,
                    examination_type_snapshot, quantity, clinical_description
                ) values (
                    :requestId, :tenantId, :serviceType, :specimenType, :examinationType, 1, :description
                )
                """, new MapSqlParameterSource().addValue("requestId", requestId)
                .addValue("tenantId", input.tenantId()).addValue("serviceType", resolved.serviceType())
                .addValue("specimenType", resolved.specimenType()).addValue("examinationType", resolved.examinationType())
                .addValue("description", trim(input.instructions())));
    }

    private static String nextRequestNo() {
        String id = Long.toString(GlobalIds.next());
        return "IP" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
                + id.substring(Math.max(0, id.length() - 8));
    }

    private static String normalize(String value) {
        String trimmed = trim(value);
        return trimmed == null ? null : trimmed.toUpperCase(Locale.ROOT);
    }

    private static String defaultText(String value, String fallback) {
        String trimmed = trim(value);
        return trimmed == null ? fallback : trimmed;
    }

    private static String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record CreateFact(Long tenantId, Long episodeId, Long encounterId, Long residentId,
                             Long organizationId, Long departmentId, String orderCategory,
                             Long catalogItemId, String itemCode, String itemName,
                             BigDecimal dosageAmount, String dosageUnit, String routeCode,
                             String frequencyCode, String instructions, Long actorId) {
    }

    public record RequestDetails(Long medicationId, String medicationCode, String medicationName,
                                 BigDecimal dosageAmount, String dosageUnit,
                                 String routeCode, String frequencyCode, boolean selfProvided,
                                 BigDecimal quantity, String quantityUnit,
                                 BigDecimal baseQuantity, String baseUnit) {
        static final RequestDetails EMPTY = new RequestDetails(
                null, null, null, null, null, null, null, false, null, null, null, null);
    }

    public record ServiceDetails(String serviceType, String specimenType, String examinationType,
                                 BigDecimal quantity) {
    }

    private record ResolvedItem(Long catalogItemId, Long medicationId, String itemCode, String itemName,
                                String unitCode, String localCode, String localName, Long adoptionId,
                                Long adoptionRevision, Long defaultDepartmentId,
                                Long priceId, Long priceRevision, String priceType,
                                BigDecimal unitPrice, String currencyCode, String attributeSnapshot, String attributeHash,
                                Instant attributeResolvedAt, String mappingSnapshot, MedicationSnapshot medication,
                                String serviceType, String specimenType, String examinationType) {
    }
}
