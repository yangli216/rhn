package com.rhn.billing.application;

import com.rhn.billing.domain.ReliefApplication;
import com.rhn.billing.domain.ReliefPolicy;
import com.rhn.billing.domain.ReliefPolicyVersion;
import com.rhn.billing.domain.ReliefSponsor;
import com.rhn.billing.domain.ReliefTiming;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.ReliefApplicationRepository;
import com.rhn.billing.infrastructure.ReliefPolicyRepository;
import com.rhn.billing.infrastructure.ReliefPolicyVersionRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

/**
 * 惠民减免明细查询，供与民政、慈善等承担方对账报销：按记录时间查询当前机构的减免与退费冲销记录，
 * 冲销记录金额为负，汇总按政策与承担方给出减免、冲销与净额。
 */
@Service
public class ReliefRecordQueryService {
    static final int MAX_RANGE_DAYS = 366;
    static final int MAX_RECORDS = 20_000;
    static final int MAX_PAGE_SIZE = 5_000;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final ExecutionContextProvider contextProvider;
    private final ReliefApplicationRepository applications;
    private final ReliefPolicyRepository policies;
    private final ReliefPolicyVersionRepository versions;
    private final SettlementRepository settlements;
    private final ResidentDirectory residents;
    private final DictionaryDirectory dictionaries;
    private final BillingCashierResolver users;
    private final JsonCodec json;

    public ReliefRecordQueryService(ExecutionContextProvider contextProvider, ReliefApplicationRepository applications,
                                    ReliefPolicyRepository policies, ReliefPolicyVersionRepository versions,
                                    SettlementRepository settlements, ResidentDirectory residents,
                                    DictionaryDirectory dictionaries, BillingCashierResolver users, JsonCodec json) {
        this.contextProvider = contextProvider; this.applications = applications; this.policies = policies;
        this.versions = versions; this.settlements = settlements; this.residents = residents;
        this.dictionaries = dictionaries; this.users = users; this.json = json;
    }

    @Transactional(readOnly = true)
    public ReliefRecordPage search(ReliefRecordQuery query) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden("RELIEF_QUERY_CONTEXT_REQUIRED", "惠民减免查询需要机构工作上下文");
        if (query.from() == null || query.to() == null || query.from().isAfter(query.to())) {
            throw badRequest("RELIEF_QUERY_DATE_REQUIRED", "开始日期和结束日期不能为空，且开始日期不能晚于结束日期");
        }
        if (query.to().toEpochDay() - query.from().toEpochDay() >= MAX_RANGE_DAYS) {
            throw badRequest("RELIEF_QUERY_RANGE_TOO_LONG", "查询日期跨度不能超过一年");
        }
        int size = Math.max(1, Math.min(query.size() == null ? 50 : query.size(), MAX_PAGE_SIZE));
        int page = Math.max(0, query.page() == null ? 0 : query.page());
        List<ReliefApplication> found = applications.searchRecords(context.tenantId(), context.organizationId(),
                query.from().atStartOfDay(BUSINESS_ZONE).toInstant(),
                query.to().plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant(),
                query.policyId(), query.sponsor(), query.timing(), PageRequest.of(0, MAX_RECORDS + 1));
        if (found.size() > MAX_RECORDS) {
            throw badRequest("RELIEF_QUERY_TOO_MANY", "查询结果超过 " + MAX_RECORDS + " 条，请缩小日期范围或增加条件");
        }
        List<ReliefRecordView> rows = rows(context, found).stream().filter(row -> matches(row, query)).toList();

        Map<String, SummaryBuilder> groups = new LinkedHashMap<>();
        Set<Long> patients = new HashSet<>();
        BigDecimal relief = BigDecimal.ZERO;
        BigDecimal reversal = BigDecimal.ZERO;
        for (ReliefRecordView row : rows) {
            groups.computeIfAbsent(row.policyId() + "|" + Objects.toString(row.payerName(), ""),
                    key -> new SummaryBuilder(row)).add(row);
            if (row.reversal()) reversal = reversal.add(row.reliefAmount().negate());
            else { relief = relief.add(row.reliefAmount()); patients.add(row.residentId()); }
        }
        List<ReliefRecordSummaryView> summary = groups.values().stream().map(SummaryBuilder::view)
                .sorted((a, b) -> b.netAmount().compareTo(a.netAmount())).toList();
        int fromIndex = Math.min(rows.size(), page * size);
        return new ReliefRecordPage(rows.subList(fromIndex, Math.min(rows.size(), fromIndex + size)), rows.size(), page, size,
                summary, money(relief), money(reversal), money(relief.subtract(reversal)), patients.size());
    }

    private List<ReliefRecordView> rows(ExecutionContext context, List<ReliefApplication> found) {
        if (found.isEmpty()) return List.of();
        Map<Long, ReliefApplication> originals = new HashMap<>();
        found.forEach(value -> originals.put(value.id(), value));
        List<Long> missing = found.stream().map(ReliefApplication::reversesApplicationId)
                .filter(id -> id != null && !originals.containsKey(id)).distinct().toList();
        if (!missing.isEmpty()) applications.findAllById(missing).forEach(value -> originals.put(value.id(), value));

        Map<Long, Settlement> settlementById = settlements.findAllById(Stream.concat(found.stream(), originals.values().stream())
                        .map(ReliefApplication::settlementId).distinct().toList()).stream()
                .collect(Collectors.toMap(Settlement::id, Function.identity()));
        Map<Long, ReliefPolicy> policyById = policies.findAllById(found.stream().map(ReliefApplication::policyId).distinct().toList())
                .stream().collect(Collectors.toMap(ReliefPolicy::id, Function.identity()));
        Map<Long, ReliefPolicyVersion> versionById = versions.findByTenantIdAndIdIn(context.tenantId(),
                        found.stream().map(ReliefApplication::policyVersionId).distinct().toList()).stream()
                .collect(Collectors.toMap(ReliefPolicyVersion::id, Function.identity()));
        Map<String, String> qualificationTypes = dictionaries.resolveItemTexts(context.tenantId(),
                ReliefPolicyApplicationService.QUALIFICATION_TYPE_DICTIONARY);
        Map<Long, ResidentSnapshot> residentById = new HashMap<>();
        Map<Long, String> userNames = new HashMap<>();
        Function<Long, String> userName = id -> id == null ? null : userNames.computeIfAbsent(id, key -> {
            BillingCashierResolver.Cashier user = users.resolve(context.tenantId(), key);
            return user.name() != null ? user.name() : user.username();
        });

        List<ReliefRecordView> rows = new ArrayList<>();
        for (ReliefApplication value : found) {
            boolean reversal = value.reversesApplicationId() != null;
            ReliefApplication source = reversal ? originals.getOrDefault(value.reversesApplicationId(), value) : value;
            Settlement settlement = settlementById.get(value.settlementId());
            Settlement original = settlementById.get(source.settlementId());
            ReliefPolicy policy = policyById.get(value.policyId());
            ReliefPolicyVersion version = versionById.get(value.policyVersionId());
            ResidentSnapshot resident = residentById.computeIfAbsent(value.residentId(),
                    id -> residents.requireSnapshot(context.tenantId(), id));
            rows.add(new ReliefRecordView(value.id(), value.createdAt(), value.settlementId(),
                    settlement == null ? null : settlement.settlementNo(),
                    settlement == null ? null : settlement.status().name(), value.settlementScene(),
                    value.residentId(), resident.fullName(), resident.healthRecordNo(), resident.gender(),
                    resident.birthDate(), value.policyId(), policy == null ? null : policy.code(),
                    policy == null ? null : policy.name(), version == null ? null : version.versionNo(),
                    value.timing().name(), value.sponsor().name(), version == null ? null : version.payerCode(),
                    version == null ? null : version.payerName(), money(value.baseAmount()), money(value.reliefAmount()),
                    value.status().name(), reversal, value.reversesApplicationId(),
                    reversal && original != null ? original.settlementNo() : null,
                    source.manualReason() != null, source.manualReason(), source.manualEvidence(),
                    userName.apply(source.approvedBy()), userName.apply(value.createdBy()),
                    qualificationText(source.qualificationEvidenceJson(), qualificationTypes)));
        }
        return rows;
    }

    private static boolean matches(ReliefRecordView row, ReliefRecordQuery query) {
        if (Boolean.TRUE.equals(query.manualOnly()) && !row.manual()) return false;
        if (Boolean.TRUE.equals(query.settledOnly()) && !SettlementStatus.SETTLED.name().equals(row.settlementStatus())) {
            return false;
        }
        String keyword = query.keyword() == null ? null : query.keyword().trim().toLowerCase(Locale.ROOT);
        if (keyword == null || keyword.isEmpty()) return true;
        return Stream.of(row.residentName(), row.healthRecordNo(), row.settlementNo(), row.originalSettlementNo(),
                        row.policyName(), row.policyCode(), row.payerName(), row.manualEvidence())
                .filter(Objects::nonNull).anyMatch(value -> value.toLowerCase(Locale.ROOT).contains(keyword));
    }

    /** 资格依据摘要：名单类别与证明编号、属性条件或全部患者。 */
    private String qualificationText(String evidenceJson, Map<String, String> types) {
        if (evidenceJson == null || evidenceJson.isBlank()) return null;
        List<String> parts = new ArrayList<>();
        for (Map<?, ?> item : json.read(evidenceJson, Map[].class)) {
            String source = Objects.toString(item.get("source"), "");
            switch (source) {
                case "ROSTER" -> {
                    String type = Objects.toString(item.get("qualificationType"), "");
                    Object evidenceNo = item.get("evidenceNo");
                    parts.add(types.getOrDefault(type, type) + (evidenceNo == null ? "" : "（" + evidenceNo + "）"));
                }
                case "ATTRIBUTE" -> parts.add("符合属性条件");
                case "ALL" -> parts.add("全部患者");
                default -> { }
            }
        }
        return parts.isEmpty() ? null : String.join("；", parts);
    }

    private static BigDecimal money(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }

    private static final class SummaryBuilder {
        private final ReliefRecordView first;
        private final Set<Long> patients = new HashSet<>();
        private long reliefCount;
        private long reversalCount;
        private BigDecimal relief = BigDecimal.ZERO;
        private BigDecimal reversal = BigDecimal.ZERO;

        SummaryBuilder(ReliefRecordView first) { this.first = first; }

        void add(ReliefRecordView row) {
            if (row.reversal()) { reversalCount++; reversal = reversal.add(row.reliefAmount().negate()); }
            else { reliefCount++; relief = relief.add(row.reliefAmount()); patients.add(row.residentId()); }
        }

        ReliefRecordSummaryView view() {
            return new ReliefRecordSummaryView(first.policyId(), first.policyCode(), first.policyName(), first.sponsor(),
                    first.payerCode(), first.payerName(), reliefCount, reversalCount, patients.size(), money(relief),
                    money(reversal), money(relief.subtract(reversal)));
        }
    }

    /** 查询条件：日期按减免记录时间；manualOnly 只看人工核定，settledOnly 只看结算已完成的记录。 */
    public record ReliefRecordQuery(LocalDate from, LocalDate to, Long policyId, ReliefSponsor sponsor, ReliefTiming timing,
                                    Boolean manualOnly, Boolean settledOnly, String keyword, Integer page, Integer size) {}

    public record ReliefRecordView(Long id, Instant occurredAt, Long settlementId, String settlementNo,
                                   @DictionaryBinding("BIL_SETTLEMENT_STATUS") String settlementStatus,
                                   @DictionaryBinding("BIL_SETTLEMENT_SCENE") String settlementScene,
                                   Long residentId, String residentName, String healthRecordNo,
                                   @DictionaryBinding("RESIDENT_GENDER") String gender, LocalDate birthDate,
                                   Long policyId, String policyCode, String policyName, Integer versionNo,
                                   @DictionaryBinding("BIL_RELIEF_TIMING") String timing,
                                   @DictionaryBinding("BIL_RELIEF_SPONSOR") String sponsor,
                                   String payerCode, String payerName, BigDecimal baseAmount, BigDecimal reliefAmount,
                                   @DictionaryBinding("BIL_RELIEF_APPLICATION_STATUS") String status, boolean reversal,
                                   Long reversesApplicationId, String originalSettlementNo, boolean manual,
                                   String manualReason, String manualEvidence, String approvedByName,
                                   String operatorName, String qualificationText) {}

    public record ReliefRecordSummaryView(Long policyId, String policyCode, String policyName,
                                          @DictionaryBinding("BIL_RELIEF_SPONSOR") String sponsor, String payerCode,
                                          String payerName, long reliefCount, long reversalCount, long patientCount,
                                          BigDecimal reliefAmount, BigDecimal reversalAmount, BigDecimal netAmount) {}

    public record ReliefRecordPage(List<ReliefRecordView> items, long total, int page, int size,
                                   List<ReliefRecordSummaryView> summary, BigDecimal reliefAmount,
                                   BigDecimal reversalAmount, BigDecimal netAmount, long patientCount) {}
}
