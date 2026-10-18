package com.rhn.billing.application;

import com.rhn.billing.domain.ReliefRosterEntry;
import com.rhn.billing.domain.ReliefRosterStatus;
import com.rhn.billing.infrastructure.ReliefRosterRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.shared.api.StaleRevisionException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * 惠民资格名单维护。同一居民同一资格类别的有效记录有效期不得重叠；
 * 批量导入按证件匹配主索引居民，可先预检，正式导入只写入通过校验的行，批次号保证不重复导入。
 */
@Service
public class ReliefRosterApplicationService {
    static final int IMPORT_LIMIT = 2000;
    private static final int SEARCH_LIMIT = 500;

    private final ReliefRosterRepository roster;
    private final ResidentDirectory residents;
    private final DictionaryDirectory dictionaries;
    private final ExecutionContextProvider contextProvider;

    public ReliefRosterApplicationService(ReliefRosterRepository roster, ResidentDirectory residents,
                                          DictionaryDirectory dictionaries, ExecutionContextProvider contextProvider) {
        this.roster = roster; this.residents = residents; this.dictionaries = dictionaries;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<ReliefRosterEntryView> search(String qualificationType, Long residentId, ReliefRosterStatus status,
                                        String importBatch) {
        ExecutionContext context = contextProvider.requireCurrent();
        return roster.search(context.tenantId(), trimToNull(qualificationType), residentId, status,
                        trimToNull(importBatch), PageRequest.of(0, SEARCH_LIMIT)).stream()
                .map(ReliefRosterApplicationService::view).toList();
    }

    @Transactional
    public ReliefRosterEntryView add(ReliefAddRosterCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        String type = requireQualificationType(context, input.qualificationType());
        if (input.residentId() == null) throw badRequest("RELIEF_ROSTER_RESIDENT_REQUIRED", "必须选择居民");
        ResidentSnapshot resident = residents.requireSnapshotForUpdate(input.residentId());
        requireValidity(input.effectiveFrom(), input.effectiveTo());
        requireNoOverlap(context, resident.id(), type, input.effectiveFrom(), input.effectiveTo(), null);
        return view(roster.save(new ReliefRosterEntry(context.tenantId(), context.organizationId(), type, resident.id(),
                resident.fullName(), input.effectiveFrom(), input.effectiveTo(), trimToNull(input.evidenceNo()),
                trimToNull(input.evidence()), null, context.subjectId(), Instant.now())));
    }

    @Transactional
    public ReliefRosterEntryView update(Long entryId, ReliefUpdateRosterCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefRosterEntry entry = requireEntry(context, entryId, input.expectedRevision());
        requireValidity(input.effectiveFrom(), input.effectiveTo());
        residents.requireSnapshotForUpdate(entry.residentId());
        requireNoOverlap(context, entry.residentId(), entry.qualificationType(), input.effectiveFrom(),
                input.effectiveTo(), entry.id());
        entry.revise(input.effectiveFrom(), input.effectiveTo(), trimToNull(input.evidenceNo()),
                trimToNull(input.evidence()), context.subjectId(), Instant.now());
        roster.flush();
        return view(entry);
    }

    @Transactional
    public ReliefRosterEntryView revoke(Long entryId, ReliefRevokeRosterCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        ReliefRosterEntry entry = requireEntry(context, entryId, input.expectedRevision());
        entry.revoke(input.reason(), context.subjectId(), Instant.now());
        roster.flush();
        return view(entry);
    }

    /** 预检与正式导入共用同一套校验；正式导入只写入通过的行，其余行返回原因供下载修正。 */
    @Transactional
    public ReliefRosterImportResultView importRoster(ReliefRosterImportCommand input) {
        ExecutionContext context = contextProvider.requireCurrent();
        String batch = trimToNull(input.batchCode());
        if (batch == null || batch.length() > 64) throw badRequest("RELIEF_ROSTER_BATCH_INVALID", "导入批次号不能为空且不超过 64 字符");
        String type = requireQualificationType(context, input.qualificationType());
        List<ReliefRosterImportRow> rows = input.rows() == null ? List.of() : input.rows();
        if (rows.isEmpty()) throw badRequest("RELIEF_ROSTER_IMPORT_EMPTY", "导入文件没有数据行");
        if (rows.size() > IMPORT_LIMIT) throw badRequest("RELIEF_ROSTER_IMPORT_TOO_LARGE", "单次最多导入 " + IMPORT_LIMIT + " 行");
        if (!input.dryRun() && roster.existsByTenantIdAndImportBatch(context.tenantId(), batch)) {
            throw conflict("RELIEF_ROSTER_BATCH_IMPORTED", "该批次已导入，请勿重复提交");
        }
        Instant now = Instant.now();
        Map<Long, List<Period>> accepted = new HashMap<>();
        List<ReliefRosterImportRowResult> results = new ArrayList<>();
        int imported = 0;
        for (ReliefRosterImportRow row : rows) {
            String problem = null;
            ResidentSnapshot resident = null;
            if (trimToNull(row.identifierValue()) == null) problem = "证件号码为空";
            else {
                resident = residents.findByIdentifier(trimToNull(row.identifierType()) == null ? "NATIONAL_ID" : row.identifierType(),
                        row.identifierValue()).orElse(null);
                if (resident == null) problem = "未在居民主索引中找到该证件";
                else if (trimToNull(row.residentName()) != null && !row.residentName().trim().equals(resident.fullName())) {
                    problem = "姓名与主索引不一致（主索引为 " + resident.fullName() + "）";
                } else if (row.effectiveFrom() == null || (row.effectiveTo() != null && row.effectiveTo().isBefore(row.effectiveFrom()))) {
                    problem = "资格有效期不正确";
                } else if (accepted.getOrDefault(resident.id(), List.of()).stream()
                        .anyMatch(period -> period.overlaps(row.effectiveFrom(), row.effectiveTo()))) {
                    problem = "与文件中其他行的有效期重叠";
                } else if (overlapping(context, resident.id(), type, row.effectiveFrom(), row.effectiveTo(), null)) {
                    problem = "已有有效期重叠的资格记录";
                }
            }
            if (problem != null) {
                results.add(new ReliefRosterImportRowResult(row.rowNo(), "REJECTED", resident == null ? null : resident.id(),
                        resident == null ? trimToNull(row.residentName()) : resident.fullName(), problem));
                continue;
            }
            accepted.computeIfAbsent(resident.id(), key -> new ArrayList<>()).add(new Period(row.effectiveFrom(), row.effectiveTo()));
            if (!input.dryRun()) {
                roster.save(new ReliefRosterEntry(context.tenantId(), context.organizationId(), type, resident.id(),
                        resident.fullName(), row.effectiveFrom(), row.effectiveTo(), trimToNull(row.evidenceNo()),
                        trimToNull(row.evidence()), batch, context.subjectId(), now));
                imported++;
            }
            results.add(new ReliefRosterImportRowResult(row.rowNo(), input.dryRun() ? "ACCEPTED" : "IMPORTED", resident.id(),
                    resident.fullName(), null));
        }
        long rejected = results.stream().filter(value -> "REJECTED".equals(value.status())).count();
        return new ReliefRosterImportResultView(batch, type, input.dryRun(), rows.size(), rows.size() - (int) rejected,
                (int) rejected, imported, List.copyOf(results));
    }

    private String requireQualificationType(ExecutionContext context, String value) {
        String type = trimToNull(value);
        if (type == null) throw badRequest("RELIEF_ROSTER_TYPE_REQUIRED", "必须选择资格类别");
        if (!dictionaries.resolveItemTexts(context.tenantId(), ReliefPolicyApplicationService.QUALIFICATION_TYPE_DICTIONARY)
                .containsKey(type)) {
            throw badRequest("RELIEF_QUALIFICATION_TYPE_INVALID", "资格类别不存在：" + type);
        }
        return type;
    }

    private ReliefRosterEntry requireEntry(ExecutionContext context, Long entryId, Long expectedRevision) {
        ReliefRosterEntry entry = roster.findByIdAndTenantId(entryId, context.tenantId())
                .orElseThrow(() -> notFound("RELIEF_ROSTER_NOT_FOUND", "未找到资格名单记录"));
        if (expectedRevision == null) throw badRequest("RELIEF_ROSTER_REVISION_REQUIRED", "必须提供名单记录修订号");
        if (entry.revision() != expectedRevision) {
            throw new StaleRevisionException(entry.revision(), "名单记录已被其他用户修改，请刷新后重试");
        }
        return entry;
    }

    private static void requireValidity(LocalDate from, LocalDate to) {
        if (from == null || (to != null && to.isBefore(from))) {
            throw badRequest("RELIEF_ROSTER_VALIDITY_INVALID", "资格有效期不正确");
        }
    }

    private void requireNoOverlap(ExecutionContext context, Long residentId, String type, LocalDate from, LocalDate to,
                                  Long excludedId) {
        if (overlapping(context, residentId, type, from, to, excludedId)) {
            throw conflict("RELIEF_ROSTER_OVERLAP", "该居民已有有效期重叠的同类资格");
        }
    }

    private boolean overlapping(ExecutionContext context, Long residentId, String type, LocalDate from, LocalDate to,
                                Long excludedId) {
        return roster.findByTenantIdAndResidentIdAndQualificationTypeAndStatus(context.tenantId(), residentId, type,
                        ReliefRosterStatus.ACTIVE).stream()
                .anyMatch(entry -> !Objects.equals(entry.id(), excludedId) && entry.overlaps(from, to));
    }

    private static ReliefRosterEntryView view(ReliefRosterEntry entry) {
        return new ReliefRosterEntryView(entry.id(), entry.revision(), entry.organizationId(), entry.qualificationType(),
                entry.residentId(), entry.residentNameSnapshot(), entry.effectiveFrom(), entry.effectiveTo(),
                entry.evidenceNo(), entry.evidence(), entry.importBatch(), entry.status().name(), entry.statusReason(),
                entry.updatedAt());
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record Period(LocalDate from, LocalDate to) {
        boolean overlaps(LocalDate otherFrom, LocalDate otherTo) {
            return (otherTo == null || !otherTo.isBefore(from)) && (to == null || !to.isBefore(otherFrom));
        }
    }

    public record ReliefAddRosterCommand(String qualificationType, Long residentId, LocalDate effectiveFrom,
                                   LocalDate effectiveTo, String evidenceNo, String evidence) {}

    public record ReliefUpdateRosterCommand(Long expectedRevision, LocalDate effectiveFrom, LocalDate effectiveTo,
                                      String evidenceNo, String evidence) {}

    public record ReliefRevokeRosterCommand(Long expectedRevision, String reason) {}

    /** identifierType 默认 NATIONAL_ID；residentName 填写时需与主索引一致。 */
    public record ReliefRosterImportRow(int rowNo, String identifierType, String identifierValue, String residentName,
                            LocalDate effectiveFrom, LocalDate effectiveTo, String evidenceNo, String evidence) {}

    public record ReliefRosterImportCommand(String batchCode, String qualificationType, boolean dryRun, List<ReliefRosterImportRow> rows) {}

    public record ReliefRosterImportRowResult(int rowNo, String status, Long residentId, String residentName, String message) {}

    public record ReliefRosterImportResultView(String batchCode,
                                   @DictionaryBinding(ReliefPolicyApplicationService.QUALIFICATION_TYPE_DICTIONARY) String qualificationType,
                                   boolean dryRun, int totalRows, int acceptedRows, int rejectedRows, int importedRows,
                                   List<ReliefRosterImportRowResult> rows) {}

    public record ReliefRosterEntryView(Long id, long revision, Long organizationId,
                                  @DictionaryBinding(ReliefPolicyApplicationService.QUALIFICATION_TYPE_DICTIONARY) String qualificationType,
                                  Long residentId, String residentName, LocalDate effectiveFrom, LocalDate effectiveTo,
                                  String evidenceNo, String evidence, String importBatch,
                                  @DictionaryBinding("BIL_RELIEF_ROSTER_STATUS") String status, String statusReason,
                                  Instant updatedAt) {}
}
