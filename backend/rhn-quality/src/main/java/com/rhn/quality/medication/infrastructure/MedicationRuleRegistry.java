package com.rhn.quality.medication.infrastructure;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

/** Read-only platform rule catalog. New definitions/versions are installed explicitly by migrations in QMED-1. */
@Repository
public class MedicationRuleRegistry {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;

    public MedicationRuleRegistry(JdbcTemplate jdbc, JsonCodec json) {
        this.jdbc = jdbc; this.json = json;
    }

    public List<RuleVersion> load(String ruleSetVersion) {
        return jdbc.query("""
                select v.*, d.CD_RULE, d.CD_CATEGORY, d.NA_RULE
                  from RHN_AUD_MED_RULE_VER v join RHN_AUD_MED_RULE d on d.ID_RULE = v.ID_RULE
                 where v.CD_RULE_SET_VER = ? order by d.CD_RULE, v.NO_VERSION
                """, (rs, row) -> {
            var until = rs.getObject("DT_EFFECTIVE_TO", OffsetDateTime.class);
            return new RuleVersion(rs.getLong("ID_RULE_VER"),
                    new RuleDefinition(rs.getLong("ID_RULE"), rs.getString("CD_RULE"),
                            rs.getString("CD_CATEGORY"), rs.getString("NA_RULE")),
                    rs.getInt("NO_VERSION"), rs.getString("CD_RULE_SET_VER"), rs.getString("CD_IMPLEMENTATION"),
                    rs.getString("SD_STATUS"), MedicationSafetyDecision.Severity.valueOf(rs.getString("SD_SEVERITY")),
                    MedicationSafetyDecision.Status.valueOf(rs.getString("SD_DECISION")),
                    MedicationSafetyDecision.OverridePolicy.valueOf(rs.getString("SD_OVERRIDE_POLICY")),
                    rs.getObject("DT_EFFECTIVE_FROM", OffsetDateTime.class).toInstant(),
                    until == null ? null : until.toInstant(),
                    Arrays.asList(json.read(rs.getString("JSON_EVIDENCE"), MedicationSafetyDecision.Evidence[].class)));
        }, ruleSetVersion);
    }
}
