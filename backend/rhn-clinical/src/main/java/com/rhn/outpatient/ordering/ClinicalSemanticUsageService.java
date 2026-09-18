package com.rhn.outpatient.ordering;

import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
class ClinicalSemanticUsageService implements ClinicalSemanticImpactContributor {
    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contexts;
    ClinicalSemanticUsageService(JdbcTemplate jdbc, ExecutionContextProvider contexts) {
        this.jdbc = jdbc; this.contexts = contexts;
    }

    @Override
    @Transactional(readOnly = true)
    public Impact describe(String kind, String conceptId) {
        var context = contexts.requireCurrent();
        if (!context.hasWorkContext()) return new Impact("ACTIVE_ORDERS", "UNAVAILABLE", null, List.of(), true,
                "选择工作机构和科室后可查询当前范围内的在用医嘱");
        String column = switch (kind) {
            case "MEDICATION" -> "m.ID_MED";
            case "ROUTE" -> "m.ID_CONCEPT_ROUTE";
            case "FREQUENCY" -> "m.ID_ORDER_FREQ";
            default -> null;
        };
        if (column == null) return new Impact("ACTIVE_ORDERS", "UNAVAILABLE", null, List.of(), true,
                "当前尚无临床单位的跨医嘱使用索引");
        Long count = jdbc.queryForObject("""
                select count(*) from RHN_EX_MED_REQ m join RHN_EX_CARE_REQ r on r.ID_CARE_REQ = m.ID_CARE_REQ
                where r.ID_TNT = ? and m.ID_TNT = ? and r.ID_ORG_EXEC = ? and r.ID_DEPT_EXEC = ?
                  and r.SD_STATUS in ('DRAFT', 'ACTIVE') and
                """ + column + " = ?", Long.class, context.tenantId(), context.tenantId(), context.organizationId(),
                context.departmentId(), Long.valueOf(conceptId));
        return new Impact("ACTIVE_ORDERS", "CURRENT_WORK_SCOPE", count, List.of(), true,
                "包含当前科室的门诊和住院草稿、有效医嘱；历史快照保持原值");
    }
}
