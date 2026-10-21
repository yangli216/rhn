package com.rhn.outpatient.scheduling;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class OutpatientMaintenanceTables {
    private OutpatientMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_EX_CARE_REQ", "ID_CARE_REQ", "OUTPATIENT", "照护请求", false),
                new TableDefinition("RHN_EX_MED_REQ", "ID_CARE_REQ", "OUTPATIENT", "药品请求", false),
                new TableDefinition("RHN_EX_OP_REFER_EVT", "ID_OP_REFER_EVT", "OUTPATIENT", "门诊转诊事件", false),
                new TableDefinition("RHN_EX_OP_REFER_REQ", "ID_OP_REFER_REQ", "OUTPATIENT", "门诊转诊请求", false),
                new TableDefinition("RHN_EX_REQ_GRP", "ID_REQ_GRP", "OUTPATIENT", "请求分组", false),
                new TableDefinition("RHN_EX_SVC_DOC", "ID_SVC_DOC", "OUTPATIENT", "服务申请单", false),
                new TableDefinition("RHN_EX_SVC_REQ", "ID_CARE_REQ", "OUTPATIENT", "服务请求", false),
                new TableDefinition("RHN_META_OP_NOTE_FORM_VER", "ID_OP_NOTE_FORM_VER", "OUTPATIENT", "门诊备注表单版本", true),
                new TableDefinition("RHN_META_OP_NOTE_TMPL", "ID_OP_NOTE_TMPL", "OUTPATIENT", "门诊备注模板", true),
                new TableDefinition("RHN_META_OP_PLAN_DIAG", "ID_OP_PLAN_DIAG", "OUTPATIENT", "门诊方案诊断", true),
                new TableDefinition("RHN_META_OP_PLAN_MED", "ID_OP_PLAN_MED", "OUTPATIENT", "门诊方案药品", true),
                new TableDefinition("RHN_META_OP_PLAN_SVC", "ID_OP_PLAN_SVC", "OUTPATIENT", "门诊方案服务", true),
                new TableDefinition("RHN_META_OP_PLAN_TMPL", "ID_OP_PLAN_TMPL", "OUTPATIENT", "门诊方案模板", true),
                new TableDefinition("RHN_OP_TRIAGE_REC", "ID_TRIAGE_REC", "OUTPATIENT", "一行代表一次预检分诊", false),
                new TableDefinition("RHN_SC_APPT", "ID_APPT", "OUTPATIENT", "预约", false),
                new TableDefinition("RHN_SC_APPT_EVT", "ID_APPT_EVT", "OUTPATIENT", "预约事件", false),
                new TableDefinition("RHN_SC_PAT_REG", "ID_PAT_REG", "OUTPATIENT", "患者挂号", false),
                new TableDefinition("RHN_SC_SCHED_EXCEPT", "ID_SCHED_EXCEPT", "OUTPATIENT", "排班例外", true),
                new TableDefinition("RHN_SC_SCHED_GEN_RUN", "ID_SCHED_GEN_RUN", "OUTPATIENT", "排班生成运行", true),
                new TableDefinition("RHN_SC_SCHED_SLOT_HOLD", "ID_SCHED_SLOT_HOLD", "OUTPATIENT", "排班号源占用", true),
                new TableDefinition("RHN_SC_SCHED_SLOT_POOL", "ID_SCHED_SLOT_POOL", "OUTPATIENT", "排班号源池", true),
                new TableDefinition("RHN_SC_SCHED_TMPL", "ID_SCHED_TMPL", "OUTPATIENT", "排班模板", true),
                new TableDefinition("RHN_SC_SCHED_TMPL_PERIOD", "ID_SCHED_TMPL_PERIOD", "OUTPATIENT", "排班模板期间", true),
                new TableDefinition("RHN_SC_SLOT_EVT", "ID_SLOT_EVT", "OUTPATIENT", "号源事件", true),
                new TableDefinition("RHN_SC_SVC_SCHED", "ID_SVC_SCHED", "OUTPATIENT", "服务排班", true),
                new TableDefinition("RHN_SC_SVC_SCHED_EVT", "ID_SVC_SCHED_EVT", "OUTPATIENT", "服务排班事件", true),
                new TableDefinition("RHN_SYS_SVC_RSRC", "ID_SVC_RSRC", "OUTPATIENT", "服务资源", true),
                new TableDefinition("RHN_VIS_ENC", "ID_ENC", "OUTPATIENT", "就诊", false),
                new TableDefinition("RHN_VIS_ENC_COMP_CHECK", "ID_ENC_COMP_CHECK", "OUTPATIENT", "就诊完成核查", false),
                new TableDefinition("RHN_VIS_ENC_COMP_ISSUE", "ID_ENC_COMP_ISSUE", "OUTPATIENT", "就诊完成问题", false),
                new TableDefinition("RHN_VIS_ENC_DIAG", "ID_ENC_DIAG", "OUTPATIENT", "就诊诊断", false),
                new TableDefinition("RHN_VIS_ENC_DIAG_REV", "ID_ENC_DIAG_REV", "OUTPATIENT", "就诊诊断修订", false),
                new TableDefinition("RHN_VIS_ENC_IDENT_CHECK", "ID_ENC_IDENT_CHECK", "OUTPATIENT", "就诊身份核查", false),
                new TableDefinition("RHN_VIS_ENC_STATUS_EVT", "ID_ENC_STATUS_EVT", "OUTPATIENT", "就诊状态事件", false),
                new TableDefinition("RHN_VIS_ENC_WORK_SESSION", "ID_ENC_WORK_SESSION", "OUTPATIENT", "就诊工作会话", false)
        );
    }
}
