package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.StandardCatalogEditionContracts.*;
import com.rhn.platform.masterdata.api.StandardCatalogReview;
import com.rhn.platform.masterdata.api.MedicationStandardImpactDirectory;
import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.platform.masterdata.infrastructure.StandardCatalogEditionStore;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DuplicateKeyException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class StandardCatalogEditionService {
    private final StandardMedicationCatalogService runtime;private final StandardCatalogEditionStore store;
    private final StandardCatalogReviewService reviews;private final MedicationStandardImpactDirectory impacts;
    private final ExecutionContextProvider contexts;private final JsonCodec json;
    public StandardCatalogEditionService(StandardMedicationCatalogService runtime,StandardCatalogEditionStore store,StandardCatalogReviewService reviews,MedicationStandardImpactDirectory impacts,ExecutionContextProvider contexts,JsonCodec json) {
        this.runtime=runtime;this.store=store;this.reviews=reviews;this.impacts=impacts;this.contexts=contexts;this.json=json;
    }
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")||c.subjectId()==null)throw forbidden("STANDARD_EDITION_FORBIDDEN","需要基础数据管理权限及明确的操作人员身份");return c.tenantId();}
    public Edition current() {tenant();return baseline().edition();}
    public PageResult<Edition> list(int page) {var t=tenant();page(page);long n=store.count(t);return new PageResult<>(store.list(t,page),n,(int)((n+19)/20),page,20);}
    private Stored baseline() {
        var node=runtime.snapshot();var e=new Edition(0L,identity(node),rawHash(json.write(node)),node.path("contentHash").asString(),"medication-standard-catalog.json","当前随程序提供的运行目录",null,"系统资源",null,node.path("entries").size(),node.path("specifications").size(),node.path("issues").size(),true,"RUNTIME",null);
        return new Stored(e,node,json.write(node));
    }
    private Stored require(Long id) {var t=tenant();if(Objects.equals(id,0L))return baseline();return store.find(t,id).orElseThrow(()->notFound("STANDARD_EDITION_NOT_FOUND","未找到当前租户的目录版次"));}
    public Detail detail(Long id,int reviewPage) {
        var s=require(id);return new Detail(s.edition(),s.catalog().path("source"),reviews.view(s.edition().identity(),reviewPage),List.of("目录登记与来源核验不改变运行版次、药品关联或规则发布状态。","上传包的来源名称和原文件指纹属于提供者声明，须人工核对原文与发布来源。","新登记版次的内容指纹由服务端按规范化 JSON 重新计算；原声明指纹另行保留。"));
    }
    public JsonNode content(Long id) {return require(id).catalog().deepCopy();}
    public Original original(Long id) {var s=require(id);if(!Objects.equals(rawHash(s.uploadedText()),s.edition().packageHash()))throw conflict("STANDARD_EDITION_INTEGRITY","原登记文本与上传指纹不一致");return new Original(s.edition().fileName(),s.uploadedText(),s.edition().packageHash());}
    @Transactional public Detail register(Import input) {
        Long t=tenant();
        if(input==null||blank(input.fileName(),240)||blank(input.reason(),2000)||input.content()==null||input.content().length()>8_000_000)throw badRequest("STANDARD_EDITION_INPUT","请选择不超过 8 百万字符的目录 JSON，并填写文件名和登记原因");
        var base=baseline();if(!Objects.equals(base.edition().packageHash(),input.expectedRuntimeHash()))throw conflict("STANDARD_EDITION_BASE_CHANGED","当前运行目录已变化，请刷新后重新核对");
        ObjectNode node;
        try {
            var parsed=json.readStrictTree(input.content());if(parsed==null||!parsed.isObject())throw new IllegalArgumentException();node=(ObjectNode)parsed;bounded(node,0,new int[]{0});
        } catch(RuntimeException ex) {throw badRequest("STANDARD_EDITION_JSON","目录必须是有效 JSON 对象，不能含重复字段或超出结构限制");}
        validate(node);
        if(!Objects.equals(node.path("catalogId").asString(),base.edition().identity().catalogId()))throw badRequest("STANDARD_EDITION_FAMILY","请登记当前标准目录的后续版次，不能混入其他编码体系");
        if(Objects.equals(node.path("catalogVersion").asString(),base.edition().identity().catalogVersion()))throw conflict("STANDARD_EDITION_VERSION","不能覆盖当前运行目录的版次；修改内容须使用新的版次标识");
        String declared=node.path("contentHash").asString("");node.remove("contentHash");
        node.put("contentHash",ClinicalSemanticVersions.hash(node,json));
        store.lockTenant(t);
        var archived=store.version(t,base.edition().identity().catalogId(),base.edition().identity().catalogVersion()).orElse(null);
        if(archived!=null&&!Objects.equals(archived.catalog(),base.catalog()))throw conflict("STANDARD_EDITION_RUNTIME_DRIFT","当前运行目录与已登记同版号内容不同，请先核查版本管理，不能覆盖归档");
        var c=contexts.requireCurrent();
        if(archived==null) {
            var e=base.edition();var archive=new Edition(GlobalIds.next(),e.identity(),e.packageHash(),e.declaredContentHash(),e.fileName(),"登记新版前归档当前运行目录",c.subjectId(),c.actor(),Instant.now(),e.entries(),e.specifications(),e.issues(),false,"RUNTIME_ARCHIVE",null);
            archived=new Stored(archive,base.catalog(),base.uploadedText());store.append(t,archived);
        }
        var edition=new Edition(GlobalIds.next(),identity(node),rawHash(input.content()),declared,input.fileName().strip(),input.reason().strip(),c.subjectId(),c.actor(),Instant.now(),node.path("entries").size(),node.path("specifications").size(),node.path("issues").size(),false,"IMPORTED",archived.edition().id());
        try {store.append(t,new Stored(edition,node,input.content()));}catch(DuplicateKeyException ex){throw conflict("STANDARD_EDITION_VERSION","该目录版次已经登记，不能原地覆盖；请核对已有版次或使用新的版本号");}
        return detail(edition.id(),0);
    }
    @Transactional public Detail review(Long id,StandardCatalogReview.Change command) {var value=require(id);reviews.change(value.edition().identity(),command);return detail(id,0);}
    public Comparison compare(Long target,Long base,int page,String group) {
        page(page);if(!List.of("ALL","METADATA","ENTRY","SPECIFICATION").contains(group))throw badRequest("STANDARD_EDITION_DIFF_FILTER","差异筛选无效");
        var a=require(base);var b=require(target);if(!a.edition().identity().catalogId().equals(b.edition().identity().catalogId()))throw badRequest("STANDARD_EDITION_DIFF_FAMILY","仅可比较同一目录的版次");
        var changes=new ArrayList<Change>();
        compareObjects(a.catalog().path("entries"),b.catalog().path("entries"),"ENTRY",changes);
        compareObjects(a.catalog().path("specifications"),b.catalog().path("specifications"),"SPECIFICATION",changes);
        var left=((ObjectNode)a.catalog()).deepCopy();var right=((ObjectNode)b.catalog()).deepCopy();left.remove("entries");left.remove("specifications");right.remove("entries");right.remove("specifications");
        walk("METADATA","catalog","目录与来源","",left,right,changes);
        var counts=new TreeMap<String,Integer>();for(String key:List.of("ENTRY","SPECIFICATION","METADATA"))counts.put(key,(int)changes.stream().filter(v->v.group().equals(key)).count());
        var selected=changes.stream().filter(v->"ALL".equals(group)||v.group().equals(group)).toList();
        String hash=ClinicalSemanticVersions.hash(Map.of("base",a.edition(),"target",b.edition(),"changes",changes),json);
        return new Comparison(a.edition(),b.edition(),hash,counts,paginate(selected,page));
    }
    public Dependencies dependencies(Long id,int page) {
        page(page);var target=require(id).edition();var all=impacts.capture(List.of(new Scope(target.identity().catalogId(),null,null)));
        var area=all.getFirst();return new Dependencies(target,ClinicalSemanticVersions.hash(all,json),area.coverage(),area.limitations(),paginate(area.dependencies(),page));
    }
    private void compareObjects(JsonNode a,JsonNode b,String group,List<Change> changes) {
        var left=index(a);var right=index(b);var ids=new TreeSet<>(left.keySet());ids.addAll(right.keySet());
        for(String id:ids) {var before=left.get(id);var after=right.get(id);String name=(after==null?before:after).path("name").asString(id);walk(group,id,name,"",before,after,changes);}
    }
    private Map<String,JsonNode> index(JsonNode nodes) {var values=new TreeMap<String,JsonNode>();nodes.forEach(n->values.put(n.path("id").asString(),n));return values;}
    private void walk(String group,String id,String name,String path,JsonNode a,JsonNode b,List<Change> result) {
        if(a==null||b==null) {result.add(new Change(group,id,name,a==null?"ADDED":"REMOVED",path.isEmpty()?"/":path,a,b));return;}
        if(a.equals(b)||a.isNumber()&&b.isNumber()&&a.decimalValue().compareTo(b.decimalValue())==0)return;
        if(a.isObject()&&b.isObject()) {
            var keys=new TreeSet<String>();a.properties().forEach(e->keys.add(e.getKey()));b.properties().forEach(e->keys.add(e.getKey()));
            for(String key:keys)walk(group,id,name,path+"/"+key.replace("~","~0").replace("/","~1"),a.get(key),b.get(key),result);
        } else if(a.isArray()&&b.isArray()) {
            for(int i=0;i<Math.max(a.size(),b.size());i++)walk(group,id,name,path+"/"+i,i<a.size()?a.get(i):null,i<b.size()?b.get(i):null,result);
        } else result.add(new Change(group,id,name,"CHANGED",path.isEmpty()?"/":path,a,b));
    }
    private void validate(ObjectNode n) {
        if(!n.path("schemaVersion").isIntegralNumber()||n.path("schemaVersion").asInt()!=1)invalid("仅支持 schemaVersion=1 的目录包");
        for(String f:List.of("catalogId","catalogVersion"))if(!n.path(f).isString()||blank(n.path(f).asString(""),64))invalid("目录标识与版次必填，最多 64 字");
        if(n.has("contentHash")&&!n.path("contentHash").isNull()&&(!n.path("contentHash").isString()||!n.path("contentHash").asString().matches("[a-fA-F0-9]{64}")))invalid("声明内容指纹应为 64 位 SHA256，或不提供由服务端计算");
        var source=n.path("source");if(!source.isObject()||!source.path("title").isString()||!source.path("sha256").isString()||blank(source.path("title").asString(""),500)||!source.path("sha256").asString("").matches("[a-fA-F0-9]{64}"))invalid("请保留来源标题和原来源文件 SHA256");
        for(String f:List.of("entries","specifications","issues"))if(!n.path(f).isArray()||n.path(f).size()>30000)invalid("entries、specifications、issues 必须为数组，每类最多 30000 项");
        if(n.path("entries").isEmpty())invalid("目录至少应有一个条目");
        var entries=new HashMap<String,JsonNode>();var specs=new HashMap<String,JsonNode>();String sourceHash=source.path("sha256").asString();
        for(var e:n.path("entries")) {
            object(e,sourceHash);String id=e.path("id").asString();if(entries.put(id,e)!=null)invalid("条目标识重复："+id);
            if(!List.of("MEDICATION","SCOPE").contains(e.path("entryType").asString()))invalid("条目类型无效："+id);
        }
        for(var s:n.path("specifications")) {
            object(s,sourceHash);String id=s.path("id").asString();if(specs.put(id,s)!=null)invalid("规格标识重复："+id);
            var entry=entries.get(s.path("entryId").asString());if(entry==null||!"MEDICATION".equals(entry.path("entryType").asString())||!entry.path("medicationType").equals(s.path("medicationType")))invalid("规格所属条目不存在、为范围条目或药品类型不一致："+id);
            if(blank(s.path("doseForm").asString(""),120)||blank(s.path("specification").asString(""),4000)||!s.path("strength").isObject()||!s.path("strength").path("computable").isBoolean())invalid("规格缺少剂型、规格原文或强度结构："+id);
            var strength=s.path("strength");if(strength.path("computable").asBoolean()) {
                String kind=strength.path("kind").asString();if(!List.of("AMOUNT_PER_PRESENTATION","CONCENTRATION","PRESENTATION_VOLUME").contains(kind))invalid("强度类型不能标为可计算："+id);
                if(!"PRESENTATION_VOLUME".equals(kind))measure(strength.path("numerator"),id);
                if(!"AMOUNT_PER_PRESENTATION".equals(kind))measure(strength.path("denominator"),id);
            }
        }
        for(var issue:n.path("issues")) {
            if(!issue.isObject()||!entries.containsKey(issue.path("entryId").asString()))invalid("待核验项引用了不存在的条目");
            if(!issue.path("specificationId").isMissingNode()&&!issue.path("specificationId").isNull()) {
                var spec=specs.get(issue.path("specificationId").asString());if(spec==null||!spec.path("entryId").equals(issue.path("entryId")))invalid("待核验项与规格所属条目不一致");
            }
        }
    }
    private void object(JsonNode n,String hash) {
        if(!n.isObject()||!n.path("id").isString()||!n.path("name").isString()||!n.path("sourceVersion").isString()||!n.path("id").asString("").matches("[A-Za-z0-9_.:-]{1,120}")||blank(n.path("name").asString(""),500)||!List.of("WESTERN","CHINESE_PATENT").contains(n.path("medicationType").asString())||!n.path("semanticVersion").isIntegralNumber()||n.path("semanticVersion").asInt()<1||!Objects.equals(n.path("sourceVersion").asString(),hash))invalid("条目或规格的标识、名称、药品类型、语义版本或来源文件引用无效");
    }
    private void measure(JsonNode n,String id) {try {if(!n.isObject()||blank(n.path("unit").asString(""),40)||new java.math.BigDecimal(n.path("value").asString()).signum()<=0)invalid("可计算强度必须有正数及单位："+id);}catch(NumberFormatException ex){invalid("强度数值无效："+id);}}
    private void bounded(JsonNode n,int depth,int[] nodes) {if(depth>40||++nodes[0]>600000)throw new IllegalArgumentException();if(n.isObject())n.properties().forEach(e->bounded(e.getValue(),depth+1,nodes));else if(n.isArray())n.forEach(v->bounded(v,depth+1,nodes));}
    private StandardCatalogReview.Identity identity(JsonNode n) {return new StandardCatalogReview.Identity(n.path("catalogId").asString(),n.path("catalogVersion").asString(),n.path("contentHash").asString(),n.path("source").path("sha256").asString());}
    private static String rawHash(String text) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException ex){throw new IllegalStateException(ex);}}
    private boolean blank(String s,int max) {return s==null||s.isBlank()||s.length()>max;}
    private void invalid(String message) {throw badRequest("STANDARD_EDITION_STRUCTURE",message);}
    private void page(int page) {if(page<0)throw badRequest("STANDARD_EDITION_PAGE","页码不能小于零");}
    private <T> PageResult<T> paginate(List<T> rows,int page) {return new PageResult<>(rows.stream().skip((long)page*20).limit(20).toList(),rows.size(),(rows.size()+19)/20,page,20);}
}
