package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationSafetyCategoryContracts.*;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

@Repository
public class MedicationSafetyCategoryStore {
    private final JdbcTemplate jdbc;

    public MedicationSafetyCategoryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CategoryView> findCategories(Long tenantId, String query, String ruleKind) {
        StringBuilder sql = new StringBuilder("""
                select c.ID_SAFETY_CAT, c.CD_CAT, c.NA_CAT, c.SD_RULE_KIND, c.DES_RATIONALE,
                       c.FG_SYSTEM, c.SD_STATUS, c.REVISION, c.DT_CREATED, c.DT_UPDATED,
                       c.CD_CAT_MAJOR, c.CD_CAT_SUB, c.FG_SYSTEMIC_ONLY,
                       (select count(*) from RHN_AUD_MED_SAFETY_CAT_MBR m where m.ID_SAFETY_CAT = c.ID_SAFETY_CAT and m.ID_TNT = c.ID_TNT) as MBR_COUNT
                  from RHN_AUD_MED_SAFETY_CAT c
                 where c.ID_TNT = ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        if (query != null && !query.isBlank()) {
            sql.append(" and (lower(c.CD_CAT) like ? or lower(c.NA_CAT) like ?)");
            String q = "%" + query.trim().toLowerCase() + "%";
            params.add(q);
            params.add(q);
        }
        if (ruleKind != null && !ruleKind.isBlank()) {
            sql.append(" and c.SD_RULE_KIND = ?");
            params.add(ruleKind.trim());
        }
        sql.append(" order by c.FG_SYSTEM desc, c.CD_CAT asc");

        return jdbc.query(sql.toString(), (rs, i) -> {
            var dtCreated = rs.getObject("DT_CREATED", OffsetDateTime.class);
            var dtUpdated = rs.getObject("DT_UPDATED", OffsetDateTime.class);
            return new CategoryView(
                    rs.getLong("ID_SAFETY_CAT"),
                    rs.getString("CD_CAT"),
                    rs.getString("NA_CAT"),
                    rs.getString("SD_RULE_KIND"),
                    rs.getString("DES_RATIONALE"),
                    rs.getBoolean("FG_SYSTEM"),
                    rs.getString("SD_STATUS"),
                    rs.getInt("MBR_COUNT"),
                    rs.getInt("REVISION"),
                    dtCreated != null ? dtCreated.toInstant() : Instant.now(),
                    dtUpdated != null ? dtUpdated.toInstant() : Instant.now(),
                    rs.getString("CD_CAT_MAJOR"),
                    rs.getString("CD_CAT_SUB"),
                    rs.getBoolean("FG_SYSTEMIC_ONLY")
            );
        }, params.toArray());
    }

    public Optional<CategoryView> findCategoryById(Long tenantId, Long id) {
        String sql = """
                select c.ID_SAFETY_CAT, c.CD_CAT, c.NA_CAT, c.SD_RULE_KIND, c.DES_RATIONALE,
                       c.FG_SYSTEM, c.SD_STATUS, c.REVISION, c.DT_CREATED, c.DT_UPDATED,
                       c.CD_CAT_MAJOR, c.CD_CAT_SUB, c.FG_SYSTEMIC_ONLY,
                       (select count(*) from RHN_AUD_MED_SAFETY_CAT_MBR m where m.ID_SAFETY_CAT = c.ID_SAFETY_CAT and m.ID_TNT = c.ID_TNT) as MBR_COUNT
                  from RHN_AUD_MED_SAFETY_CAT c
                 where c.ID_TNT = ? and c.ID_SAFETY_CAT = ?
                """;
        return jdbc.query(sql, (rs, i) -> {
            var dtCreated = rs.getObject("DT_CREATED", OffsetDateTime.class);
            var dtUpdated = rs.getObject("DT_UPDATED", OffsetDateTime.class);
            return new CategoryView(
                    rs.getLong("ID_SAFETY_CAT"),
                    rs.getString("CD_CAT"),
                    rs.getString("NA_CAT"),
                    rs.getString("SD_RULE_KIND"),
                    rs.getString("DES_RATIONALE"),
                    rs.getBoolean("FG_SYSTEM"),
                    rs.getString("SD_STATUS"),
                    rs.getInt("MBR_COUNT"),
                    rs.getInt("REVISION"),
                    dtCreated != null ? dtCreated.toInstant() : Instant.now(),
                    dtUpdated != null ? dtUpdated.toInstant() : Instant.now(),
                    rs.getString("CD_CAT_MAJOR"),
                    rs.getString("CD_CAT_SUB"),
                    rs.getBoolean("FG_SYSTEMIC_ONLY")
            );
        }, tenantId, id).stream().findFirst();
    }

    public Optional<CategoryView> findCategoryByCode(Long tenantId, String code) {
        String sql = """
                select c.ID_SAFETY_CAT, c.CD_CAT, c.NA_CAT, c.SD_RULE_KIND, c.DES_RATIONALE,
                       c.FG_SYSTEM, c.SD_STATUS, c.REVISION, c.DT_CREATED, c.DT_UPDATED,
                       c.CD_CAT_MAJOR, c.CD_CAT_SUB, c.FG_SYSTEMIC_ONLY,
                       (select count(*) from RHN_AUD_MED_SAFETY_CAT_MBR m where m.ID_SAFETY_CAT = c.ID_SAFETY_CAT and m.ID_TNT = c.ID_TNT) as MBR_COUNT
                  from RHN_AUD_MED_SAFETY_CAT c
                 where c.ID_TNT = ? and c.CD_CAT = ?
                """;
        return jdbc.query(sql, (rs, i) -> {
            var dtCreated = rs.getObject("DT_CREATED", OffsetDateTime.class);
            var dtUpdated = rs.getObject("DT_UPDATED", OffsetDateTime.class);
            return new CategoryView(
                    rs.getLong("ID_SAFETY_CAT"),
                    rs.getString("CD_CAT"),
                    rs.getString("NA_CAT"),
                    rs.getString("SD_RULE_KIND"),
                    rs.getString("DES_RATIONALE"),
                    rs.getBoolean("FG_SYSTEM"),
                    rs.getString("SD_STATUS"),
                    rs.getInt("MBR_COUNT"),
                    rs.getInt("REVISION"),
                    dtCreated != null ? dtCreated.toInstant() : Instant.now(),
                    dtUpdated != null ? dtUpdated.toInstant() : Instant.now(),
                    rs.getString("CD_CAT_MAJOR"),
                    rs.getString("CD_CAT_SUB"),
                    rs.getBoolean("FG_SYSTEMIC_ONLY")
            );
        }, tenantId, code).stream().findFirst();
    }

    public CategoryView createCategory(Long tenantId, Long userId, CreateCategoryRequest req) {
        Long id = GlobalIds.next();
        String sql = """
                insert into RHN_AUD_MED_SAFETY_CAT
                    (ID_SAFETY_CAT, ID_TNT, CD_CAT, NA_CAT, SD_RULE_KIND, DES_RATIONALE, FG_SYSTEM, SD_STATUS, REVISION,
                     CD_CAT_MAJOR, CD_CAT_SUB, FG_SYSTEMIC_ONLY,
                     DT_CREATED, ID_USER_CREATED, DT_UPDATED, ID_USER_UPDATED)
                values (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?, ?, ?, current_timestamp, ?, current_timestamp, ?)
                """;
        jdbc.update(sql, id, tenantId, req.code().trim().toUpperCase(), req.name().trim(),
                req.ruleKind().trim().toUpperCase(), req.rationale() != null ? req.rationale().trim() : null,
                false, req.catalogMajor(), req.catalogSub(),
                Boolean.TRUE.equals(req.systemicOnly()), userId, userId);
        return findCategoryById(tenantId, id).orElseThrow();
    }

    public CategoryView updateCategory(Long tenantId, Long id, Long userId, UpdateCategoryRequest req) {
        String sql = """
                update RHN_AUD_MED_SAFETY_CAT
                   set NA_CAT = ?, DES_RATIONALE = ?, SD_STATUS = ?,
                       CD_CAT_MAJOR = ?, CD_CAT_SUB = ?, FG_SYSTEMIC_ONLY = ?,
                       REVISION = REVISION + 1,
                       DT_UPDATED = current_timestamp, ID_USER_UPDATED = ?
                 where ID_TNT = ? and ID_SAFETY_CAT = ? and REVISION = ?
                """;
        int updated = jdbc.update(sql, req.name().trim(), req.rationale() != null ? req.rationale().trim() : null,
                req.status() != null ? req.status().trim().toUpperCase() : "ACTIVE",
                req.catalogMajor(), req.catalogSub(), Boolean.TRUE.equals(req.systemicOnly()),
                userId, tenantId, id, req.expectedRevision());
        if (updated == 0) {
            throw new IllegalStateException("更新分类失败：修订冲突或分类不存在");
        }
        return findCategoryById(tenantId, id).orElseThrow();
    }

    public void deleteCategory(Long tenantId, Long id) {
        jdbc.update("delete from RHN_AUD_MED_SAFETY_CAT where ID_TNT = ? and ID_SAFETY_CAT = ? and FG_SYSTEM = ?", tenantId, id, false);
    }

    public List<MemberView> findMembers(Long tenantId, Long categoryId, String query) {
        StringBuilder sql = new StringBuilder("""
                select m.ID_MEMBER, m.ID_SAFETY_CAT, m.ID_MED, m.CD_MED, m.NA_MED_SNAP,
                       m.PREP_SPEC_SNAP, m.DOSE_FORM_SNAP, m.DT_CREATED
                  from RHN_AUD_MED_SAFETY_CAT_MBR m
                 where m.ID_TNT = ? and m.ID_SAFETY_CAT = ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.add(categoryId);

        if (query != null && !query.isBlank()) {
            sql.append(" and (lower(m.NA_MED_SNAP) like ? or lower(m.CD_MED) like ?)");
            String q = "%" + query.trim().toLowerCase() + "%";
            params.add(q);
            params.add(q);
        }
        sql.append(" order by m.NA_MED_SNAP asc, m.ID_MEMBER asc");

        return jdbc.query(sql.toString(), (rs, i) -> {
            var dt = rs.getObject("DT_CREATED", OffsetDateTime.class);
            return new MemberView(
                    rs.getLong("ID_MEMBER"),
                    rs.getLong("ID_SAFETY_CAT"),
                    rs.getObject("ID_MED") != null ? rs.getLong("ID_MED") : null,
                    rs.getString("CD_MED"),
                    rs.getString("NA_MED_SNAP"),
                    rs.getString("PREP_SPEC_SNAP"),
                    rs.getString("DOSE_FORM_SNAP"),
                    dt != null ? dt.toInstant() : Instant.now(),
                    false
            );
        }, params.toArray());
    }

    public int addMembers(Long tenantId, Long categoryId, Long userId, List<MemberItem> items) {
        int added = 0;
        String checkSql = "select count(*) from RHN_AUD_MED_SAFETY_CAT_MBR where ID_TNT = ? and ID_SAFETY_CAT = ? and (ID_MED = ? or NA_MED_SNAP = ?)";
        String insertSql = """
                insert into RHN_AUD_MED_SAFETY_CAT_MBR
                    (ID_MEMBER, ID_TNT, ID_SAFETY_CAT, ID_MED, CD_MED, NA_MED_SNAP, PREP_SPEC_SNAP, DOSE_FORM_SNAP, REVISION, DT_CREATED, ID_USER_CREATED)
                values (?, ?, ?, ?, ?, ?, ?, ?, 0, current_timestamp, ?)
                """;

        for (var item : items) {
            if (item.medicationName() == null || item.medicationName().isBlank()) continue;
            Long exists = jdbc.queryForObject(checkSql, Long.class, tenantId, categoryId, item.medicationId(), item.medicationName().trim());
            if (exists != null && exists > 0) continue;

            jdbc.update(insertSql,
                    GlobalIds.next(), tenantId, categoryId, item.medicationId(),
                    item.medicationCode(), item.medicationName().trim(),
                    item.preparationSpec(), item.doseForm(), userId);
            added++;
        }
        return added;
    }

    public void removeMember(Long tenantId, Long categoryId, Long memberId) {
        jdbc.update("delete from RHN_AUD_MED_SAFETY_CAT_MBR where ID_TNT = ? and ID_SAFETY_CAT = ? and ID_MEMBER = ?",
                tenantId, categoryId, memberId);
    }

    public List<MemberItem> findMedicationsByGenericNames(Long tenantId, List<String> names, boolean systemicOnly) {
        if (names == null || names.isEmpty()) return List.of();
        StringBuilder sql = new StringBuilder("""
                select m.ID_MED, m.CD_MED, m.NA_MED, m.PREP_SPEC, m.DOSE_FORM
                  from RHN_BD_MED m
                 where m.ID_TNT = ? and m.SD_STATUS = 'ACTIVE'
                """);
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        sql.append(" and (");
        for (int i = 0; i < names.size(); i++) {
            if (i > 0) sql.append(" or ");
            sql.append("m.NA_MED like ? or m.NA_ALIAS like ?");
            String namePattern = "%" + names.get(i).trim() + "%";
            params.add(namePattern);
            params.add(namePattern);
        }
        sql.append(")");

        if (systemicOnly) {
            sql.append("""
                 and (m.DOSE_FORM is null or (
                     m.DOSE_FORM not like '%膏%' and m.DOSE_FORM not like '%贴%'
                     and m.DOSE_FORM not like '%凝胶%' and m.DOSE_FORM not like '%栓%'
                     and m.DOSE_FORM not like '%滴眼%' and m.DOSE_FORM not like '%滴鼻%'
                     and m.DOSE_FORM not like '%滴耳%' and m.DOSE_FORM not like '%喷雾%'
                     and m.DOSE_FORM not like '%洗剂%' and m.DOSE_FORM not like '%搽剂%'
                     and m.DOSE_FORM not like '%外用%'
                 ))
                 and (m.PREP_SPEC is null or (
                     m.PREP_SPEC not like '%眼%' and m.PREP_SPEC not like '%鼻%'
                     and m.PREP_SPEC not like '%耳%' and m.PREP_SPEC not like '%膏%'
                     and m.PREP_SPEC not like '%贴%'
                 ))
            """);
        }
        sql.append(" order by m.NA_MED asc, m.ID_MED asc");

        return jdbc.query(sql.toString(), (rs, i) -> new MemberItem(
                rs.getLong("ID_MED"),
                rs.getString("CD_MED"),
                rs.getString("NA_MED"),
                rs.getString("PREP_SPEC"),
                rs.getString("DOSE_FORM")
        ), params.toArray());
    }

    public List<MedicationTagView> findCategoriesByMedication(Long tenantId, Long medicationId, String medName) {
        String sql = """
                select distinct c.ID_SAFETY_CAT, c.CD_CAT, c.NA_CAT, c.SD_RULE_KIND, c.DES_RATIONALE
                  from RHN_AUD_MED_SAFETY_CAT_MBR m
                  join RHN_AUD_MED_SAFETY_CAT c on c.ID_SAFETY_CAT = m.ID_SAFETY_CAT and c.ID_TNT = m.ID_TNT
                 where m.ID_TNT = ? and c.SD_STATUS = 'ACTIVE'
                   and (m.ID_MED = ? or (m.NA_MED_SNAP = ?))
                 order by c.CD_CAT asc
                """;
        return jdbc.query(sql, (rs, i) -> new MedicationTagView(
                rs.getLong("ID_SAFETY_CAT"),
                rs.getString("CD_CAT"),
                rs.getString("NA_CAT"),
                rs.getString("SD_RULE_KIND"),
                rs.getString("DES_RATIONALE")
        ), tenantId, medicationId, medName != null ? medName.trim() : "");
    }

    public Set<String> findCategoryCodesForMedication(Long tenantId, Long medicationId, String medName) {
        List<MedicationTagView> tags = findCategoriesByMedication(tenantId, medicationId, medName);
        Set<String> codes = new HashSet<>();
        for (var tag : tags) {
            codes.add(tag.categoryCode());
        }
        return codes;
    }

    public Set<String> findMemberNamesByCategory(Long tenantId, String categoryCode) {
        String sql = """
                select m.NA_MED_SNAP
                  from RHN_AUD_MED_SAFETY_CAT_MBR m
                  join RHN_AUD_MED_SAFETY_CAT c on c.ID_SAFETY_CAT = m.ID_SAFETY_CAT and c.ID_TNT = m.ID_TNT
                 where m.ID_TNT = ? and c.CD_CAT = ? and c.SD_STATUS = 'ACTIVE'
                """;
        return new HashSet<>(jdbc.queryForList(sql, String.class, tenantId, categoryCode));
    }
}
