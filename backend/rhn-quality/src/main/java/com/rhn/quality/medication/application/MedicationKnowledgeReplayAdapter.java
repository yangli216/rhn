package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.*;
import com.rhn.shared.json.JsonCodec;
import tools.jackson.databind.JsonNode;
import java.util.*;

/** Adapts only an immutable evaluation input. Never resolves today's medication or patient facts. */
public final class MedicationKnowledgeReplayAdapter {
    public static final String VERSION="qmed-knowledge-replay-v1";
    private MedicationKnowledgeReplayAdapter() {}
    public static Input adapt(Version knowledge,PrescriptionSafetySnapshot snapshot,JsonCodec json) {
        var gaps=new ArrayList<String>();var items=new ArrayList<Item>();var rows=new ArrayList<Row>();
        if(!Set.of("qmed-prescription-v1",PrescriptionSafetySnapshot.SCHEMA_VERSION).contains(snapshot.schemaVersion())) gaps.add("不支持该历史处方事实版本");
        if(!Set.of("DRAFT","ACTIVE").contains(snapshot.prescriptionStatus())) gaps.add("原评价时处方不是草稿或有效状态");
        var timing=snapshot.evaluationTiming();java.time.LocalDate date=null;String dateBasis="原评价未保存业务日期与时区；不使用今天或开立日期代替";
        if(timing!=null && timing.date()!=null && timing.timeZone()!=null) {
            try {java.time.ZoneId.of(timing.timeZone());date=timing.date();dateBasis="原评价冻结日期 · "+timing.timeZone();}
            catch(java.time.DateTimeException ignored) {dateBasis="原评价时区无法识别，评价日期不可用";}
        }
        for(var m:snapshot.medications()) {
            String id=m.medicationRequestId().toString();var rowGaps=new ArrayList<String>();
            Row row=new Row(id,null,null,null,null,null,null,"DRAFT".equals(m.status())?"ACTIVE":m.status());
            String name="历史药品身份不可用",semanticVersion=null;Route route=null;
            boolean excluded=Set.of("CANCELLED","STOPPED").contains(m.status());
            if(!excluded) {
                if(!m.activeForEvaluation()) rowGaps.add("医嘱状态未纳入当前回放能力");
                try {
                    JsonNode saved=json.readTree(m.medicationSnapshot()),sem=saved.path("clinicalSemantics"),ref=sem.path("standardReference"),r=sem.path("route");
                    if(m.medicationId()==null || !m.medicationId().toString().equals(saved.path("id").asString()) || !m.medicationId().toString().equals(sem.path("medicationId").asString())) throw new IllegalArgumentException();
                    if(!Set.of("VERSIONED","VERSIONED_PARTIAL").contains(m.semanticStatus()) || !"qmed-medication-semantics-v1".equals(sem.path("schemaVersion").asString())
                            || !Set.of("VERSIONED","VERSIONED_PARTIAL").contains(sem.path("status").asString()) || !sem.path("medicationSemanticVersion").asString("").matches("[a-f0-9]{64}")) throw new IllegalArgumentException();
                    name=saved.path("name").asString("未保存药品名称");semanticVersion=sem.path("medicationSemanticVersion").asString();
                    if(!"LINKED".equals(ref.path("status").asString())) rowGaps.add("药品未冻结有效的标准目录关联");
                    row=new Row(id,text(ref,"catalogId"),text(ref,"catalogVersion"),text(ref,"contentHash"),text(ref,"entryId"),text(ref,"specificationId"),text(r,"code"),row.status());
                    route=new Route(text(r,"conceptId"),text(r,"code"),text(r,"system"),text(r,"systemVersion"));
                    if(knowledge.assessment().structureComplete()) {
                        var b=knowledge.body();var a=knowledge.assessment();
                        if(inGroup(row,a.groupA(),"SAME_STANDARD_ENTRY".equals(b.matchMode()))) checkRoute(rowGaps,m,route,b.conditions().groupARoutes(),a.groupARoutes());
                        if("DRUG_INTERACTION".equals(b.kind()) && inGroup(row,a.groupB(),false)) checkRoute(rowGaps,m,route,b.conditions().groupBRoutes(),a.groupBRoutes());
                    }
                } catch(RuntimeException unreadable) {rowGaps.add("缺少可解析且身份一致的历史药品语义快照，不能用当前药品资料补齐");}
            }
            rows.add(row);items.add(new Item(id,m.revision(),m.status(),name,semanticVersion,row,route,List.copyOf(rowGaps)));
            for(String reason:rowGaps) gaps.add("医嘱 "+id+"："+reason);
        }
        Integer age=snapshot.patientContext()==null?null:snapshot.patientContext().patientAgeYears();
        return new Input(new Facts(age,"YEAR",date,List.copyOf(rows)),List.copyOf(items),List.copyOf(gaps),dateBasis);
    }
    private static String text(JsonNode node,String key) {String value=node.path(key).asString(null);return value==null||value.isBlank()?null:value;}
    private static boolean inGroup(Row r,List<ResolvedTarget> targets,boolean all) {
        return all || targets.stream().anyMatch(t->{var s=t.reference();return Objects.equals(r.catalogId(),s.catalogId())&&Objects.equals(r.catalogVersion(),s.catalogVersion())&&Objects.equals(r.contentHash(),s.contentHash())&&Objects.equals(r.entryId(),s.entryId())&&("ENTRY".equals(t.level())||Objects.equals(r.specificationId(),s.specificationId()));});
    }
    private static void checkRoute(List<String> gaps,PrescriptionSafetySnapshot.MedicationItem m,Route r,RouteCondition condition,List<RouteSnapshot> expected) {
        if(!"LIST".equals(condition.mode())) return;
        if(r==null || r.conceptId()==null || r.code()==null || r.system()==null || r.version()==null || m.routeId()==null
                || !r.conceptId().equals(m.routeId().toString()) || !Objects.equals(r.code(),m.routeCode()) || !"RESOLVED".equals(m.routeResolutionStatus())) {
            gaps.add("受限途径缺少完整、相互一致的冻结身份与版本");return;
        }
        if(expected.isEmpty() || expected.stream().anyMatch(e->!r.system().equals(e.systemCode())||!r.version().equals(e.systemVersion()))) {
            gaps.add("医嘱与知识的途径来源版本不一致，不能只按编码判断");return;
        }
        if(expected.stream().anyMatch(e->r.code().equals(e.code())!=r.conceptId().equals(e.id().toString()))) gaps.add("途径编码与概念身份的对应关系不一致");
    }
}
