package com.rhn.healthcore.maintenance;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class HealthCoreMaintenanceTables {
    private HealthCoreMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_HPL_COND", "ID_COND", "OUTPATIENT", "健康问题", true),
                new TableDefinition("RHN_INS_PAT_COVER", "ID_PAT_COVER", "OUTPATIENT", "患者保障", true),
                new TableDefinition("RHN_PI_PAT", "ID_PAT", "OUTPATIENT", "患者", true),
                new TableDefinition("RHN_PI_PAT_ADDR", "ID_PAT_ADDR", "OUTPATIENT", "患者地址", true),
                new TableDefinition("RHN_PI_PAT_DEMO_PROF", "ID_PAT", "OUTPATIENT", "患者人口学档案", true),
                new TableDefinition("RHN_PI_PAT_EMPL", "ID_PAT_EMPL", "OUTPATIENT", "患者任职", true),
                new TableDefinition("RHN_PI_PAT_IDENT", "ID_PAT_IDENT", "OUTPATIENT", "患者标识", true),
                new TableDefinition("RHN_PI_PAT_MATCH_CAND", "ID_PAT_MATCH_CAND", "OUTPATIENT", "患者匹配候选", true),
                new TableDefinition("RHN_PI_PAT_MERGE_HIST", "ID_PAT_MERGE_HIST", "OUTPATIENT", "患者合并历史", true),
                new TableDefinition("RHN_PI_PAT_RELATED_PERSON", "ID_PAT_RELATED_PERSON", "OUTPATIENT", "患者关联人员", true),
                new TableDefinition("RHN_PI_PAT_SPLIT_HIST", "ID_PAT_SPLIT_HIST", "OUTPATIENT", "患者拆分历史", true),
                new TableDefinition("RHN_PI_PAT_SRC_RECORD", "ID_PAT_SRC_RECORD", "OUTPATIENT", "患者来源记录", true),
                new TableDefinition("RHN_VIS_ALLERGY_INTOL", "ID_ALLERGY_INTOL", "OUTPATIENT", "过敏不耐受", true, java.util.Set.of("ID_ENC")),
                new TableDefinition("RHN_VIS_CLIN_DOC", "ID_CLIN_DOC", "OUTPATIENT", "临床文书", false),
                new TableDefinition("RHN_VIS_CLIN_DOC_VER", "ID_CLIN_DOC_VER", "OUTPATIENT", "临床文书版本", false),
                new TableDefinition("RHN_VIS_HEALTH_EVT", "ID_HEALTH_EVT", "OUTPATIENT", "健康事件", false)
        );
    }
}
