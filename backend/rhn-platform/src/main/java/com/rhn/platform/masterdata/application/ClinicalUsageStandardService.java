package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
@Transactional(readOnly=true)
public class ClinicalUsageStandardService implements ClinicalUsageStandardDirectory, ClinicalSemanticImpactContributor {
    private final MedicationRepository medications; private final MedicationProductRepository products;
    private final OrderFrequencyRepository frequencies; private final OrderFrequencyConfigurationRepository configurations;
    private final MedicationRouteProfileRepository routeProfiles; private final TerminologyDirectory terminology;
    private final ClinicalSemanticHistory history; private final ExecutionContextProvider contexts; private final JsonCodec json;
    public ClinicalUsageStandardService(MedicationRepository medications,MedicationProductRepository products,OrderFrequencyRepository frequencies,
            OrderFrequencyConfigurationRepository configurations,MedicationRouteProfileRepository routeProfiles,TerminologyDirectory terminology,
            ClinicalSemanticHistory history,ExecutionContextProvider contexts,JsonCodec json) {
        this.medications=medications;this.products=products;this.frequencies=frequencies;this.configurations=configurations;
        this.routeProfiles=routeProfiles;this.terminology=terminology;this.history=history;this.contexts=contexts;this.json=json;
    }
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("SEMANTIC_DEPENDENCY_FORBIDDEN","需要基础数据管理权限");return c.tenantId();}
    @Override public Scope resolve(String kind,String id) {
        Long tenant=tenant();
        if(!Set.of("MEDICATION","FREQUENCY","ROUTE","UNIT").contains(Objects.toString(kind,"")) || id==null || id.isBlank() || id.length()>64)
            throw badRequest("SEMANTIC_IMPACT_CONCEPT_INVALID","概念类型或标识无效");
        if("UNIT".equals(kind)) {
            var unit=ClinicalDoseUnits.resolve(id.startsWith("UCUM:")?id.substring(5):id).orElseThrow(()->badRequest("SEMANTIC_IMPACT_UNIT_INVALID","请从临床剂量单位词汇表选择单位；业务包装单位不能代替临床单位"));
            return new Scope(kind,unit.id(),unit.code(),unit.display(),"UCUM",Integer.toString(unit.semanticVersion()),"ACTIVE");
        }
        if(!id.matches("[1-9][0-9]{0,17}")) throw badRequest("SEMANTIC_IMPACT_CONCEPT_INVALID","请提供有效的概念标识");
        Long numeric=Long.valueOf(id);
        if("FREQUENCY".equals(kind)) return frequencies.findByIdAndTenantId(numeric,tenant).map(f->new Scope(kind,id,f.code(),f.name(),"RHN.CLINICAL.FREQUENCY",Long.toString(f.revision()),f.status())).orElse(missing(kind,id));
        if("MEDICATION".equals(kind)) return medications.findByIdAndTenantId(numeric,tenant).map(m->new Scope(kind,id,m.code(),m.name(),"LOCAL.MEDICATION",Long.toString(m.revision()),m.status())).orElse(missing(kind,id));
        var concept=terminology.findConcept(numeric);
        if(concept.isEmpty()) return missing(kind,id);
        var system=terminology.findCodeSystem(concept.get().codeSystemId()).orElseThrow(()->notFound("SEMANTIC_IMPACT_ROUTE_INVALID","无法解析当前可见的途径来源"));
        if(!"PRODUCT".equals(system.scopeType()) && !("TENANT".equals(system.scopeType()) && tenant.equals(system.scopeId())))
            throw notFound("SEMANTIC_IMPACT_ROUTE_INVALID","未找到当前租户可见的给药途径");
        if(routeProfiles.findByConceptId(numeric).isEmpty()) throw badRequest("SEMANTIC_IMPACT_ROUTE_INVALID","所选概念不是受控给药途径");
        return new Scope(kind,id,concept.get().code(),concept.get().display(),system.code(),system.versionCode(),concept.get().status());
    }
    private Scope missing(String kind,String id) {return new Scope(kind,id,null,"当前定义不可见或已缺失",null,null,"MISSING");}
    @Override public Impact describe(String kind,String id) {
        if(!contexts.requireCurrent().hasAuthority("MASTER_DATA.MANAGE")) return new Impact("MASTER_DATA_REFERENCES","UNAVAILABLE",null,List.of(),true,"需要基础数据管理权限查看默认用法及历史语义引用");
        return detail(kind,id).summary();
    }
    @Override public DetailImpact detail(String kind,String id) {
        Long tenant=tenant();var scope=resolve(kind,id);var rows=new ArrayList<Dependency>();var matchedMeds=new HashMap<Long,List<Reference>>();long active=0;
        for(var med:medications.findByTenantIdOrderByName(tenant)) {
            var refs=medicationRefs(scope,json.readTree(json.write(Map.of("id",med.id(),"defaultFrequencyId",Objects.toString(med.defaultFrequencyId(),""),
                    "defaultFrequency",safe(med.defaultFrequency()),"defaultRouteId",Objects.toString(med.defaultRouteId(),""),"defaultRoute",safe(med.defaultRoute()),
                    "defaultDoseUnit",safe(med.defaultDoseUnit()),"strengthUnit",safe(med.strengthUnit())))),"药品当前默认用法");
            if(refs.isEmpty()) continue;
            matchedMeds.put(med.id(),refs); if("ACTIVE".equals(med.status())) active++;
            rows.add(row("MEDICATION",med.id().toString(),null,med.name(),Long.toString(med.revision()),med.status(),false,"CURRENT_REFERENCE",refs));
        }
        if(!matchedMeds.isEmpty()) for(var product:products.findByTenantIdAndMedicationIdIn(tenant,matchedMeds.keySet()))
            rows.add(row("PRODUCT",product.id().toString(),product.medicationId().toString(),product.name(),null,product.status(),false,"INDIRECT_REFERENCE",matchedMeds.get(product.medicationId())));
        if("FREQUENCY".equals(kind)) for(var config:configurations.findByTenantIdAndFrequencyIdOrderByDepartmentIdDescValidFromDesc(tenant,Long.valueOf(id))) {
            var ref=new Reference("机构 "+config.organizationId()+" / 科室 "+Objects.toString(config.departmentId(),"全部"),id,scope.code(),scope.system(),Long.toString(config.revision()),null,
                    "配置有效期 "+config.validFrom()+" 至 "+Objects.toString(config.validTo(),"长期")+"；启用标志 "+config.enabled()+"；时点 "+safe(config.executionTimes())+"；首日策略 "+config.firstDayPolicy());
            rows.add(row("FREQUENCY_CONFIGURATION",config.id().toString(),id,Objects.toString(config.localName(),scope.name()),Long.toString(config.revision()),config.status(),false,"CURRENT_REFERENCE",List.of(ref)));
        }
        int unreadable=0;
        for(String semanticKind:List.of("MEDICATION","FREQUENCY","FREQUENCY_DEFINITION","FREQUENCY_CONFIGURATION","ROUTE")) {
            for(var event:history.eventsOfKind(tenant,semanticKind)) {
                JsonNode snapshot;
                try {snapshot=json.readTree(event.snapshot());} catch(RuntimeException invalid) {unreadable++;continue;}
                if(snapshot==null || !snapshot.isObject()) {unreadable++;continue;}
                var refs=new ArrayList<Reference>();
                if("MEDICATION".equals(semanticKind)) refs.addAll(medicationRefs(scope,snapshot,"药品语义快照"));
                boolean direct=("FREQUENCY".equals(kind) && (Set.of("FREQUENCY","FREQUENCY_DEFINITION").contains(semanticKind) && id.equals(event.conceptId())
                        || "FREQUENCY_CONFIGURATION".equals(semanticKind) && id.equals(snapshot.path("frequencyId").asString())))
                        || "ROUTE".equals(kind) && "ROUTE".equals(semanticKind) && id.equals(event.conceptId());
                if(direct) refs.add(new Reference("冻结的 "+semanticKind,id,snapshot.path("code").asString(null),snapshot.path("systemCode").asString(null),snapshot.path("systemVersion").asString(null),event.semanticVersion(),"保留冻结定义；记录时间 "+event.recordedAt()+"；不代表当前临床仍在使用"));
                if(!refs.isEmpty()) rows.add(row("SEMANTIC_VERSION",event.revision().toString(),event.conceptId(),snapshot.path("name").asString(snapshot.path("medicationName").asString(semanticKind)),event.semanticVersion(),"FROZEN",true,"FROZEN_REFERENCE",refs));
            }
        }
        var note="当前租户全量药品默认用法、关联产品、频次配置及已存语义快照；包含停用项，未改写历史。单位按现行临床词汇表归一化字面值，不跨维度或包装推断。";
        if(unreadable>0) note+="有 "+unreadable+" 条历史语义记录无法解析，未能排除其影响，请补充核查。";
        return new DetailImpact(new Impact("MASTER_DATA_REFERENCES",unreadable>0?"PARTIAL":"TENANT_STORED_REFERENCES",active,List.of(),true,note),rows);
    }
    private List<Reference> medicationRefs(Scope s,JsonNode m,String location) {
        var refs=new ArrayList<Reference>();
        if("MEDICATION".equals(s.kind()) && s.conceptId().equals(m.path("id").asString())) refs.add(ref(s,location,"药品身份引用"));
        if("FREQUENCY".equals(s.kind()) && (s.conceptId().equals(m.path("defaultFrequencyId").asString()) || s.code()!=null && s.code().equalsIgnoreCase(m.path("defaultFrequency").asString())))
            refs.add(new Reference(location+" · 默认频次",m.path("defaultFrequencyId").asString(null),m.path("defaultFrequency").asString(null),null,null,null,"默认值引用；不能据此判断实际医嘱使用了该频次或应迁移历史快照"));
        if("ROUTE".equals(s.kind()) && (s.conceptId().equals(m.path("defaultRouteId").asString()) || s.code()!=null && s.code().equals(m.path("defaultRoute").asString())))
            refs.add(new Reference(location+" · 默认途径",m.path("defaultRouteId").asString(null),m.path("defaultRoute").asString(null),null,null,null,"保存的默认途径；仅字面编码的旧记录未锁定术语版本，须核对历史定义"));
        if("UNIT".equals(s.kind())) for(String field:List.of("defaultDoseUnit","strengthUnit")) {
            var raw=m.path(field).asString(null);
            if(ClinicalDoseUnits.resolve(raw).map(u->u.id().equals(s.conceptId())).orElse(false)) refs.add(new Reference(location+" · "+field,null,raw,"UCUM",null,null,"按当前临床词汇表识别单位字面值；剂量值与规格含量仍须单独核对"));
        }
        return List.copyOf(refs);
    }
    private Reference ref(Scope s,String location,String note) {return new Reference(location,s.conceptId(),s.code(),s.system(),s.version(),null,note);}
    private Dependency row(String kind,String id,String parent,String name,String version,String status,boolean historical,String relation,List<Reference> refs) {return new Dependency(kind,id,parent,name,version,status,historical,relation,refs);}
    private static String safe(String s) {return s==null?"":s;}
}
