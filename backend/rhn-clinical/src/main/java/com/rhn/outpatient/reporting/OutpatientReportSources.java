package com.rhn.outpatient.reporting;

import com.rhn.shared.reporting.*;
import com.rhn.shared.reporting.ReportModel.*;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.shared.reporting.ReportModel.*;

@Component
public class OutpatientReportSources implements ReportSourceProvider {
    public List<Source> sources() {
        var orderStatus=Map.of("DRAFT","草稿","ACTIVE","有效","CANCELLED","已取消","COMPLETED","已完成");
        var kind=Map.of("MEDICATION","药品医嘱","SERVICE","检查检验及其他服务医嘱");
        var regStatus=Map.of("REGISTERED","已挂号","IN_PROGRESS","接诊中","COMPLETED","诊毕","CANCELLED","退号","SUSPENDED","暂挂","TRANSFERRED","转科","TERMINATED","终止");
        return List.of(
            new Source("REGISTRATION",1,"门诊挂号","每次挂号一行",
                "按挂号登记日期统计门诊挂号流水；默认包含所有挂号状态，可筛选挂号状态、号类和渠道。挂号总量用 registrationId COUNT，挂号患者人数用 patientId 去重统计。",
                "RHN_VIS_ENC 为门诊挂号流水主表，ID_ENC 唯一；机构及科室权限按挂号归属科室控制。",
                "RHN_VIS_ENC e","e.SD_ENC_CLASS='OUTPATIENT'","e.DT_REGD",
                List.of(id("registrationId","挂号人次","e.ID_ENC","人次"),id("patientId","挂号患者","e.ID_PAT","人"),
                    text("status","挂号状态","e.SD_STATUS",regStatus)),
                Map.of("STATUS",new Group("e.SD_STATUS","e.SD_STATUS",regStatus))),
            new Source("ENCOUNTER",1,"门诊就诊","每次就诊一行",
                "按就诊登记日期统计门诊就诊；默认包含所有当前就诊状态，可筛选状态。患者去重是当前查询范围内去重，各分组合计不一定等于去重总人数。",
                "RHN_VIS_ENC 为就诊主表，ID_ENC 唯一；机构及科室权限按就诊归属控制。",
                "RHN_VIS_ENC e","e.SD_ENC_CLASS='OUTPATIENT'","e.DT_REGD",
                List.of(id("encounterId","就诊次数","e.ID_ENC","人次"),id("patientId","就诊患者","e.ID_PAT","人"),
                    text("status","就诊状态","e.SD_STATUS",regStatus)),
                Map.of("STATUS",new Group("e.SD_STATUS","e.SD_STATUS",regStatus))),
            new Source("DIAGNOSIS",1,"门诊确诊记录","每条本次就诊有效确诊记录一行",
                "按诊断首次记录日期统计，限本次就诊、当前有效且已确诊的记录，包含主次诊断。患者及就诊可按范围去重。",
                "RHN_VIS_ENC_DIAG → RHN_VIS_ENC：ID_ENC + ID_TNT，多对一。",
                "RHN_VIS_ENC_DIAG d join RHN_VIS_ENC e on e.ID_ENC=d.ID_ENC and e.ID_TNT=d.ID_TNT",
                "e.SD_ENC_CLASS='OUTPATIENT' and d.SD_DIAG_STAGE='ENCOUNTER' and d.SD_DIAG_STATUS='ACTIVE' and d.SD_VRFCTN_STATUS='CONFIRMED'","d.DT_RECDD",
                List.of(id("recordId","确诊记录","d.ID_ENC_DIAG","条"),id("patientId","确诊患者","e.ID_PAT","人"),id("encounterId","确诊就诊","e.ID_ENC","人次"),text("diagnosisName","诊断名称","d.NA_DISPLAY",Map.of()),text("diagnosisCode","诊断编码","d.CD_ENC_DIAG",Map.of())),
                Map.of("DIAGNOSIS",new Group("d.SD_DIAG_DOMAIN || '/' || coalesce(d.CD_CODE_SYS_SNAP,'未标注编码体系') || '/' || d.CD_ENC_DIAG","d.NA_DISPLAY || '（' || d.CD_ENC_DIAG || ' · ' || coalesce(d.CD_CODE_SYS_SNAP,'未标注编码体系') || '）'",Map.of()))),
            new Source("ORDER",1,"门诊医嘱","每条医嘱一行，不是处方张数或药品数量",
                "按医嘱开立日期统计药品及服务医嘱；默认包含草稿、有效、已完成和取消状态，统计有效医嘱时必须筛选 ACTIVE。科室是就诊归属科室，不是执行科室。",
                "RHN_EX_CARE_REQ → RHN_VIS_ENC：ID_ENC + ID_TNT，多对一；不与收费明细直接展开连接。",
                "RHN_EX_CARE_REQ r join RHN_VIS_ENC e on e.ID_ENC=r.ID_ENC and e.ID_TNT=r.ID_TNT",
                "e.SD_ENC_CLASS='OUTPATIENT' and r.SD_REQ_KIND in ('MEDICATION','SERVICE')","r.DT_AUTHRD",
                List.of(id("orderId","医嘱条数","r.ID_CARE_REQ","条"),id("encounterId","有医嘱的就诊","e.ID_ENC","人次"),id("patientId","有医嘱的患者","e.ID_PAT","人"),text("status","医嘱状态","r.SD_STATUS",orderStatus),text("kind","医嘱类别","r.SD_REQ_KIND",kind),text("itemName","医嘱项目名称","r.NA_ITEM_SNAP",Map.of()),text("itemCode","医嘱项目编码","r.CD_ITEM_SNAP",Map.of())),
                Map.of("ITEM",new Group("coalesce(cast(r.ID_CATALOG_ITEM as varchar(64)),'CODE/' || r.SD_REQ_KIND || '/' || r.CD_ITEM_SNAP)","r.NA_ITEM_SNAP",Map.of()),"ORDER_TYPE",new Group("r.SD_REQ_KIND","r.SD_REQ_KIND",kind),"STATUS",new Group("r.SD_STATUS","r.SD_STATUS",orderStatus)))
        );
    }
}
