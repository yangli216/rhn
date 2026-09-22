package com.rhn;

import com.rhn.platform.masterdata.api.StandardCatalogEditionContracts.*;
import com.rhn.platform.masterdata.api.StandardCatalogReview;
import com.rhn.platform.masterdata.application.*;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.MediaType;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
import java.util.concurrent.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class StandardCatalogEditionTest extends RhnIntegrationTestSupport {
    @Autowired StandardCatalogEditionService editions;
    @Autowired StandardMedicationCatalogService runtime;
    @Autowired StandardCatalogReviewService reviews;
    @Autowired JsonCodec json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ExecutionContextProvider contexts;
    static final Long T=Long.valueOf(TENANT);
    static final String ROOT="/api/platform/master-data/medication-standard-catalog/editions";
    @BeforeEach void setup() {actor(T,7L,true);}
    void actor(Long tenant,Long actor,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,actor,"登记人员-"+actor,"test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    ObjectNode fixture(String version) {
        var n=(ObjectNode)json.readTree("{}");n.put("schemaVersion",1);n.put("catalogId",runtime.summary().path("catalogId").asString());n.put("catalogVersion",version);n.put("contentHash","b".repeat(64));
        n.putObject("source").put("title","合成目录材料，非临床证据").put("sha256","a".repeat(64)).put("verificationStatus","VERIFIED");
        var entries=n.putArray("entries");var specs=n.putArray("specifications");
        for(int i=1;i<=2;i++) {
            entries.addObject().put("id","E"+i).put("name","合成药品"+i).put("medicationType","WESTERN").put("entryType","MEDICATION").put("semanticVersion",1).put("sourceVersion","a".repeat(64));
            var s=specs.addObject().put("id","S"+i).put("entryId","E"+i).put("name","合成药品"+i).put("medicationType","WESTERN").put("semanticVersion",1).put("sourceVersion","a".repeat(64)).put("doseForm","TABLET").put("specification","1mg");
            s.putObject("strength").put("kind","AMOUNT_PER_PRESENTATION").put("computable",true).putObject("numerator").put("value","1").put("unit","mg");
        }
        n.putArray("issues");return n;
    }
    Import input(ObjectNode node) {return new Import("synthetic.json",json.write(node),"登记合成样例用于验证隔离流程",editions.current().packageHash());}
    Detail save(String version) {return editions.register(input(fixture(version)));}
    StandardCatalogReview.Change action(Detail d,String op) {
        return new StandardCatalogReview.Change(d.review().identity(),d.review().revision(),op,"SUBMIT".equals(op)?new StandardCatalogReview.Evidence("合成材料","合成机构","测试版次","归档 TEST 第 1 页","只测试结构，不构成真实核验"):null,"合成核验操作");
    }
    @Test void registers_immutable_normalized_edition_and_reviews_it_without_replacing_runtime_or_trusting_claims() throws Exception {
        var before=runtime.snapshot();var raw=input(fixture("test-2"));var d=editions.register(raw);assertThat(editions.original(d.edition().id()).content()).isEqualTo(raw.content());
        assertThat(editions.content(d.edition().baselineId())).isEqualTo(before);assertThat(editions.detail(d.edition().baselineId(),0).edition().origin()).isEqualTo("RUNTIME_ARCHIVE");assertThat(d.review().status()).isEqualTo("UNVERIFIED");assertThat(d.edition().declaredContentHash()).isEqualTo("b".repeat(64));assertThat(d.edition().identity().contentHash()).matches("[a-f0-9]{64}").isNotEqualTo(d.edition().declaredContentHash());
        var exported=(ObjectNode)editions.content(d.edition().id());var unsigned=exported.deepCopy();unsigned.remove("contentHash");assertThat(ClinicalSemanticVersions.hash(unsigned,json)).isEqualTo(d.edition().identity().contentHash());
        var submitted=editions.review(d.edition().id(),action(d,"SUBMIT"));
        assertThatThrownBy(()->editions.review(d.edition().id(),action(submitted,"VERIFY"))).hasMessageContaining("提交人不能");
        actor(T,8L,true);var verified=editions.review(d.edition().id(),action(submitted,"VERIFY"));assertThat(verified.review().status()).isEqualTo("VERIFIED");assertThat(reviews.view().status()).isEqualTo("UNVERIFIED");
        assertThatThrownBy(()->reviews.change(action(verified,"REVOKE"))).hasMessageContaining("版本已变化");assertThat(runtime.snapshot()).isEqualTo(before);
        assertThat(editions.detail(d.edition().id(),0).edition()).isEqualTo(d.edition());
        mockMvc.perform(get(ROOT+"/"+d.edition().id()).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.review.status").value("VERIFIED"));
        mockMvc.perform(get(ROOT+"/"+d.edition().id()+"/content").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.catalogVersion").value("test-2"));
    }
    @Test void full_field_diff_pins_both_editions_and_does_not_depend_on_pagination_or_identity_array_order() {
        var a=fixture("test-a");for(int i=0;i<25;i++)((ObjectNode)a.path("entries").get(0)).put("extraField"+i,"before");
        var base=editions.register(input(a));var b=a.deepCopy();b.put("catalogVersion","test-b");for(int i=0;i<25;i++)((ObjectNode)b.path("entries").get(0)).put("extraField"+i,"after");
        ((ObjectNode)b.path("specifications").get(0).path("strength").path("numerator")).put("value","2");
        ((ObjectNode)b.path("specifications").get(1)).put("entryId","E1");
        var target=editions.register(input(b));var first=editions.compare(target.edition().id(),base.edition().id(),0,"ENTRY");var second=editions.compare(target.edition().id(),base.edition().id(),1,"ENTRY");
        assertThat(first.counts().get("ENTRY")).isEqualTo(25);assertThat(first.changes().content()).hasSize(20);assertThat(second.changes().content()).hasSize(5);assertThat(second.fingerprint()).isEqualTo(first.fingerprint());
        var specs=editions.compare(target.edition().id(),base.edition().id(),0,"SPECIFICATION").changes().content();assertThat(specs).extracting(Change::path).contains("/strength/numerator/value","/entryId");
        var reordered=b.deepCopy();reordered.put("catalogVersion","test-c");var es=reordered.putArray("entries");es.add(b.path("entries").get(1));es.add(b.path("entries").get(0));var c=editions.register(input(reordered));
        assertThat(editions.compare(c.edition().id(),target.edition().id(),0,"ENTRY").changes().content()).isEmpty();
        ((ObjectNode)editions.content(target.edition().id()).path("entries").get(0)).put("name","局部修改");assertThat(editions.content(target.edition().id()).path("entries").get(0).path("name").asString()).isEqualTo("合成药品1");
    }
    @Test void rejects_duplicate_versions_malformed_references_duplicate_json_keys_and_invalid_computable_strength() {
        var d=save("same");assertThatThrownBy(()->save("same")).hasMessageContaining("已经登记");
        var baseline=fixture(runtime.summary().path("catalogVersion").asString());assertThatThrownBy(()->editions.register(input(baseline))).hasMessageContaining("不能覆盖当前");
        var bad=fixture("bad");((ObjectNode)bad.path("specifications").get(0)).put("entryId","missing");assertThatThrownBy(()->editions.register(input(bad))).hasMessageContaining("所属条目");
        var dup=fixture("dup");((ObjectNode)dup.path("entries").get(1)).put("id","E1");assertThatThrownBy(()->editions.register(input(dup))).hasMessageContaining("标识重复");
        var zero=fixture("zero");((ObjectNode)zero.path("specifications").get(0).path("strength").path("numerator")).put("value",0);assertThatThrownBy(()->editions.register(input(zero))).hasMessageContaining("正数");
        assertThatThrownBy(()->editions.register(new Import("x.json","{\"schemaVersion\":1,\"schemaVersion\":2}","测试重复字段",editions.current().packageHash()))).hasMessageContaining("重复字段");
        var trailing=input(fixture("trailing"));assertThatThrownBy(()->editions.register(new Import(trailing.fileName(),trailing.content()+" {}",trailing.reason(),trailing.expectedRuntimeHash()))).hasMessageContaining("有效 JSON");
        var in=input(fixture("stale"));assertThatThrownBy(()->editions.register(new Import(in.fileName(),in.content(),in.reason(),"old"))).hasMessageContaining("已变化");
        assertThat(editions.list(0).totalElements()).isEqualTo(2);assertThat(editions.detail(d.edition().id(),0).review().status()).isEqualTo("UNVERIFIED");
    }
    @Test void preserves_removed_and_added_objects_and_lists_all_catalog_dependencies() {
        var base=save("old");var next=fixture("next");((ObjectNode)next.path("entries").get(1)).put("id","E3");((ObjectNode)next.path("specifications").get(1)).put("id","S3").put("entryId","E3");var target=editions.register(input(next));
        assertThat(editions.compare(target.edition().id(),base.edition().id(),0,"ENTRY").changes().content()).extracting(Change::operation).containsExactlyInAnyOrder("ADDED","REMOVED");
        var refs=editions.dependencies(target.edition().id(),0);assertThat(refs.coverage()).isNotEmpty();assertThat(refs.fingerprint()).matches("[a-f0-9]{64}");assertThat(refs.target()).isEqualTo(target.edition());
    }
    @Test void tenant_actor_http_and_corrupt_archive_guards_apply_and_rollback_is_atomic() throws Exception {
        var d=save("scope");actor(T+1,7L,true);assertThat(editions.list(0).totalElements()).isZero();assertThatThrownBy(()->editions.detail(d.edition().id(),0)).hasMessageContaining("未找到");
        actor(T,7L,false);assertThatThrownBy(editions::current).hasMessageContaining("权限");actor(T,null,true);assertThatThrownBy(editions::current).hasMessageContaining("身份");actor(T,7L,true);
        new TransactionTemplate(manager).executeWithoutResult(tx->{save("rollback");tx.setRollbackOnly();});assertThat(editions.list(0).totalElements()).isEqualTo(2);
        jdbc.update("update RHN_BD_STD_EDITION set HASH_EDITION=? where ID_TNT=? and ID_STD_EDITION=?","bad",T,d.edition().id());assertThatThrownBy(()->editions.content(d.edition().id())).hasMessageContaining("指纹不一致");
        // Summary paging reads its independently protected metadata, not potentially huge catalog blobs.
        assertThat(editions.list(0).content()).hasSize(2);jdbc.update("update RHN_BD_STD_EDITION set HASH_META=? where ID_TNT=? and ID_STD_EDITION=?","bad",T,d.edition().id());assertThatThrownBy(()->editions.list(0)).hasMessageContaining("摘要与指纹");
        mockMvc.perform(get(ROOT).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(ROOT).with(rhnWorkContext()).param("page","-1")).andExpect(status().isBadRequest());
    }
    @Test void exported_runtime_package_can_be_registered_without_dropping_complex_or_unresolved_source_fields() {
        var full=(ObjectNode)runtime.snapshot();full.put("catalogVersion","test-full-roundtrip");var registered=editions.register(input(full));
        assertThat(registered.edition().entries()).isEqualTo(794);assertThat(registered.edition().specifications()).isEqualTo(2078);assertThat(registered.edition().issues()).isEqualTo(143);
        var recovered=editions.content(registered.edition().id());assertThat(recovered.path("entries")).isEqualTo(full.path("entries"));assertThat(recovered.path("specifications")).isEqualTo(full.path("specifications"));
        assertThat(editions.compare(registered.edition().id(),registered.edition().baselineId(),0,"SPECIFICATION").changes().totalElements()).isZero();
    }
    @Test void concurrent_imports_keep_one_immutable_version() throws Exception {
        var command=input(fixture("race"));var pool=Executors.newFixedThreadPool(2);var gate=new CountDownLatch(1);
        try {var tasks=new ArrayList<Future<Boolean>>();for(int i=0;i<2;i++)tasks.add(pool.submit(()->{gate.await();try{editions.register(command);return true;}catch(com.rhn.shared.api.BusinessException conflict){return false;}}));gate.countDown();int successes=0;for(var task:tasks)if(task.get(30,TimeUnit.SECONDS))successes++;assertThat(successes).isEqualTo(1);assertThat(editions.list(0).totalElements()).isEqualTo(2);}finally{pool.shutdownNow();}
    }
}
