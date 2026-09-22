package com.rhn.billing.reporting;

import com.rhn.shared.reporting.*;
import com.rhn.shared.reporting.ReportModel.*;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.shared.reporting.ReportModel.*;

@Component
public class BillingReportSources implements ReportSourceProvider {
    public List<Source> sources() {
        var kind=Map.of("MEDICATION","药品医嘱","SERVICE","检查检验及其他服务医嘱");
        var status=Map.of("DRAFT","草稿","ACTIVE","有效","COMPLETED","已完成","CANCELLED","已取消");
        return List.of(new Source("CHARGE",1,"门诊费用明细","每条已记账费用明细一行，含负数冲销行",
            "按费用发生日期统计已绑定门诊就诊的人民币已记账费用，含未结算费用，冲销以负数计入净发生额；不是实际收款、已结算收入或医保到账。未绑定就诊的费用不计入。平均金额是每条费用行均值，不是次均费用；去重就诊或患者含冲销涉及对象。",
            "RHN_BIL_CHARGE_ITEM → RHN_VIS_ENC：ID_ENC + ID_TNT，多对一；费用通过 ID_CARE_REQ + ID_TNT + ID_ENC 左关联 RHN_EX_CARE_REQ（多对一）；可按关联医嘱类别和状态筛选，未关联医嘱的费用仅在不筛选医嘱条件时保留。",
            "RHN_BIL_CHARGE_ITEM c join RHN_VIS_ENC e on e.ID_ENC=c.ID_ENC and e.ID_TNT=c.ID_TNT left join RHN_EX_CARE_REQ r on r.ID_CARE_REQ=c.ID_CARE_REQ and r.ID_TNT=c.ID_TNT and r.ID_ENC=c.ID_ENC",
            "e.SD_ENC_CLASS='OUTPATIENT' and c.SD_STATUS='POSTED' and c.CD_CCY='CNY'","c.DT_OCCRD",
            List.of(id("chargeId","费用明细条数","c.ID_CHARGE_ITEM","条"),id("encounterId","涉及就诊","e.ID_ENC","人次"),id("patientId","涉及患者","e.ID_PAT","人"),id("orderId","费用关联医嘱","r.ID_CARE_REQ","条"),number("amount","费用金额","c.AMT_TOTAL","元"),text("itemName","收费项目名称","c.NA_ITEM_SNAP",Map.of()),text("itemCode","收费项目编码","c.CD_ITEM_SNAP",Map.of()),text("sourceType","费用来源","c.SD_SRC_TYPE",Map.of()),text("orderKind","关联医嘱类别","r.SD_REQ_KIND",kind),text("orderStatus","关联医嘱状态","r.SD_STATUS",status)),
            Map.of("ITEM",new Group("cast(c.ID_CATALOG_ITEM as varchar(64))","c.NA_ITEM_SNAP",Map.of()),"ORDER_TYPE",new Group("r.SD_REQ_KIND","r.SD_REQ_KIND",kind))));
    }
}
