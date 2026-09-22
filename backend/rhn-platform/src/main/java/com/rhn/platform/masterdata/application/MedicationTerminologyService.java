package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
public class MedicationTerminologyService implements MedicationTerminologyDirectory {
    private final NamedParameterJdbcTemplate jdbc;

    public MedicationTerminologyService(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, List<MedicationClassification>> classifications(Long tenantId, Collection<Long> medicationIds) {
        if (medicationIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<Long, List<MedicationClassification>>();
        jdbc.query("""
                select m.ID_MED, c.ID_CLASS_CONCEPT, s.CD_CLASS_SYSTEM, s.NA_CLASS_SYSTEM, s.VERSION,
                       s.SD_CLASS_TYPE, c.CD_CONCEPT, c.NA_CONCEPT, c.CLASS_PATH,
                       m.SD_MAPPING_ROLE, m.FG_PRIMARY
                from RHN_BD_MED_CLASS_MAP m
                join RHN_BD_CLASS_CONCEPT c on c.ID_CLASS_CONCEPT = m.ID_CLASS_CONCEPT
                join RHN_BD_CLASS_SYSTEM s on s.ID_CLASS_SYSTEM = c.ID_CLASS_SYSTEM
                where m.ID_TNT = :tenantId and m.ID_MED in (:medicationIds)
                  and c.SD_STATUS = 'ACTIVE' and s.SD_STATUS = 'ACTIVE'
                order by m.ID_MED, s.SD_CLASS_TYPE, m.FG_PRIMARY desc, c.SORT_ORDER, c.CD_CONCEPT
                """, new MapSqlParameterSource("tenantId", tenantId).addValue("medicationIds", medicationIds),
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
            Long medicationId = rs.getLong("ID_MED");
            var value = new MedicationClassification(rs.getLong("ID_CLASS_CONCEPT"),
                    rs.getString("CD_CLASS_SYSTEM"), rs.getString("NA_CLASS_SYSTEM"), rs.getString("VERSION"),
                    rs.getString("SD_CLASS_TYPE"), rs.getString("CD_CONCEPT"), rs.getString("NA_CONCEPT"),
                    rs.getString("CLASS_PATH"), rs.getString("SD_MAPPING_ROLE"), rs.getBoolean("FG_PRIMARY"));
            result.computeIfAbsent(medicationId, ignored -> new java.util.ArrayList<>()).add(value);
        });
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, List<Long>> allergenConceptIds(Long tenantId, Collection<Long> medicationIds) {
        if (medicationIds.isEmpty()) return Map.of();
        var result = new LinkedHashMap<Long, List<Long>>();
        jdbc.query("""
                select ID_MED, ID_ALRGN from RHN_BD_MED_ALLERGEN_MAP
                where ID_TNT = :tenantId and ID_MED in (:medicationIds)
                order by ID_MED, FG_PRIMARY desc, ID_ALRGN
                """, new MapSqlParameterSource("tenantId", tenantId).addValue("medicationIds", medicationIds),
                (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                result.computeIfAbsent(rs.getLong("ID_MED"), ignored -> new java.util.ArrayList<>())
                        .add(rs.getLong("ID_ALRGN")));
        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public List<AllergenTerm> searchAllergens(Long tenantId, String categoryCode, String query) {
        String category = clean(categoryCode);
        String keyword = clean(query);
        var parameters = new MapSqlParameterSource("tenantId", tenantId)
                .addValue("category", category == null ? null : category.toUpperCase(Locale.ROOT))
                .addValue("keyword", keyword == null ? null : "%" + keyword.toLowerCase(Locale.ROOT) + "%");
        return jdbc.query("""
                select ID_ALRGN, ID_PARENT, CD_CAT, SD_CONCEPT_TYPE, CD_CODE_SYS_URI,
                       CD_ALRGN, NA_ALRGN, NA_ALIAS
                from RHN_BD_ALLERGEN
                where ID_TNT = :tenantId and SD_STATUS = 'ACTIVE'
                  and (:category is null or CD_CAT = :category)
                  and (:keyword is null or lower(CD_ALRGN) like :keyword
                       or lower(NA_ALRGN) like :keyword or lower(coalesce(NA_ALIAS, '')) like :keyword
                       or lower(coalesce(CD_SEARCH, '')) like :keyword)
                order by case SD_CONCEPT_TYPE when 'DRUG_CLASS' then 0 else 1 end, NA_ALRGN
                fetch first 100 rows only
                """, parameters, (rs, rowNum) -> term(rs));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AllergenTerm> findAllergen(Long tenantId, Long allergenId) {
        List<AllergenTerm> values = jdbc.query("""
                select ID_ALRGN, ID_PARENT, CD_CAT, SD_CONCEPT_TYPE, CD_CODE_SYS_URI,
                       CD_ALRGN, NA_ALRGN, NA_ALIAS
                from RHN_BD_ALLERGEN where ID_TNT = :tenantId and ID_ALRGN = :allergenId and SD_STATUS = 'ACTIVE'
                """, new MapSqlParameterSource("tenantId", tenantId).addValue("allergenId", allergenId),
                (rs, rowNum) -> term(rs));
        return values.stream().findFirst();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean medicationMatchesAllergen(Long tenantId, Long medicationId, Long allergenId) {
        Integer count = jdbc.queryForObject("""
                select count(*) from RHN_BD_MED_ALLERGEN_MAP
                where ID_TNT = :tenantId and ID_MED = :medicationId and ID_ALRGN = :allergenId
                """, new MapSqlParameterSource("tenantId", tenantId).addValue("medicationId", medicationId)
                .addValue("allergenId", allergenId), Integer.class);
        return count != null && count > 0;
    }

    private AllergenTerm term(java.sql.ResultSet rs) throws java.sql.SQLException {
        long parent = rs.getLong("ID_PARENT");
        return new AllergenTerm(rs.getLong("ID_ALRGN"), rs.wasNull() ? null : parent,
                rs.getString("CD_CAT"), rs.getString("SD_CONCEPT_TYPE"), rs.getString("CD_CODE_SYS_URI"),
                rs.getString("CD_ALRGN"), rs.getString("NA_ALRGN"), rs.getString("NA_ALIAS"));
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
