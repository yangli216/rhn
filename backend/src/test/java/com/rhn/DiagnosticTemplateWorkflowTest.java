package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties = "rhn.diagnostics.require-settlement-authorization=false")
class DiagnosticTemplateWorkflowTest extends RhnIntegrationTestSupport {
    private static final String CATALOG = "362387869795101";
    private static final String TEMPLATE_URL = "/api/platform/master-data/operations/services/" + CATALOG + "/report-templates";
    @Test void saved_template_and_rule_evidence_survive_a_later_publication() throws Exception {
        var version = publish(6.1);
        var task = startedTask(CATALOG,true);
        String id = task.get("id").asString();
        var input = input(task,version,"2.8","LT");
        var draft = postJson("/api/diagnostics/tasks/"+id+"/report-draft",input.toString(),200);
        assertEquals("LL",draft.get("content").get("observations").get(0).get("interpretationCode").asString());
        publish(9.0);
        var report = postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue(task,draft),201);
        assertEquals(version.get("id"),report.get("templateVersionId"));
        assertEquals("LT",report.get("observations").get(0).get("valueComparator").asString());
        assertEquals(6.1,report.get("observations").get(0).get("referenceRangeHigh").asDouble());
        assertTrue(report.get("observations").get(0).get("ruleSnapshot").asString().contains("HEXOKINASE"));
        var stored = json(mockMvc.perform(get("/api/service-requests/{id}/diagnostic-reports",task.get("requestId").asString())
                .with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get(0);
        assertEquals(report.get("templateSnapshot"),stored.get("templateSnapshot"));
        assertEquals("LT",stored.get("observations").get(0).get("valueComparator").asString());
    }
    @Test void template_cannot_be_bypassed_and_required_or_uncertain_results_cannot_be_signed() throws Exception {
        var version=publish(6.1); var task=startedTask(CATALOG,true); String id=task.get("id").asString();
        var missing=objectMapper.createObjectNode(); missing.put("expectedRevision",task.get("revision").asLong());
        postJson("/api/diagnostics/tasks/"+id+"/report-draft",missing.toString(),409);
        var input=input(task,version,"","EQ");
        var draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft",input.toString(),200);
        var failure=postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue(task,draft),409);
        assertEquals("LABORATORY_REQUIRED_RESULT_MISSING",failure.get("code").asString());
        input=input(task,version,"5","LT"); input.put("expectedDraftRevision",draft.get("revision").asLong());
        draft=postJson("/api/diagnostics/tasks/"+id+"/report-draft",input.toString(),200);
        assertEquals("POSSIBLE_CRITICAL",draft.get("content").get("observations").get(0).get("ruleStatus").asString());
        failure=postJson("/api/diagnostics/tasks/"+id+"/report-draft/issue",issue(task,draft),409);
        assertEquals("LABORATORY_RULE_REVIEW_REQUIRED",failure.get("code").asString());
    }
    @Test void publication_checks_version_and_does_not_mutate_published_content() throws Exception {
        var first=publish(6.1); var body=publication(first.get("version").asInt()-1,9.0);
        var failure=postJson(TEMPLATE_URL,body,409);
        assertEquals("DIAGNOSTIC_TEMPLATE_VERSION_CONFLICT",failure.get("code").asString());
        var history=json(mockMvc.perform(get(TEMPLATE_URL).with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(first.get("id"),history.get(0).get("id"));
        assertEquals(6.1,history.get(0).get("content").get("indicators").get(0).get("rules").get(0).get("referenceHigh").asDouble());
    }
    @Test void coded_results_keep_controlled_values_without_a_numeric_comparator() throws Exception {
        var history=json(mockMvc.perform(get(TEMPLATE_URL).with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var publication=(tools.jackson.databind.node.ObjectNode)json(publication(history.isEmpty()?0:history.get(0).get("version").asInt(),6.1));
        var indicator=(tools.jackson.databind.node.ObjectNode)publication.get("content").get("indicators").get(0);
        indicator.put("valueType","CODE"); indicator.remove("unitCode"); indicator.remove("precision");
        indicator.putArray("allowedCodes").add("NEG").add("POS");
        var rule=indicator.putArray("rules").addObject(); rule.put("code","QUAL"); rule.putArray("criticalCodes").add("POS");
        var version=postJson(TEMPLATE_URL,publication.toString(),200);
        var task=startedTask(CATALOG,true);
        var input=input(task,version,"POS","EQ");
        var row=(tools.jackson.databind.node.ObjectNode)input.get("observations").get(0); row.put("valueType","CODE"); row.remove("unitCode");
        var report=postJson("/api/diagnostics/tasks/"+task.get("id").asString()+"/local-reports",input.toString(),201);
        assertEquals("CODE",report.get("observations").get(0).get("valueType").asString());
        assertEquals("POS",report.get("observations").get(0).get("valueCode").asString());
        assertEquals("CRITICAL",report.get("observations").get(0).get("interpretationCode").asString());
        assertTrue(report.get("observations").get(0).get("valueComparator") == null
                || report.get("observations").get(0).get("valueComparator").isNull());
    }
    private JsonNode publish(double high) throws Exception {
        var units=json(mockMvc.perform(get("/api/platform/master-data/operations/units").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        boolean exists=false; for (var unit : units) if ("MMOL_L_TEST".equals(unit.get("code").asString())) exists=true;
        if (!exists) postJson("/api/platform/master-data/operations/units",
                "{\"code\":\"MMOL_L_TEST\",\"name\":\"测试毫摩尔每升\",\"symbol\":\"mmol/L\",\"dimension\":\"OTHER\",\"decimalScale\":2,\"status\":\"ACTIVE\"}",201);
        var history=json(mockMvc.perform(get(TEMPLATE_URL).with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return postJson(TEMPLATE_URL,publication(history.isEmpty()?0:history.get(0).get("version").asInt(),high),200);
    }
    private String publication(int expected,double high) {
        return """
                {"expectedVersion":%d,"effectiveFrom":"2020-01-01","publicationBasis":"虚构规则仅用于隔离测试",
                "content":{"indicators":[{"code":"GLU","name":"血糖","valueType":"NUMBER","unitCode":"MMOL_L_TEST","precision":2,
                "required":true,"methodCode":"HEXOKINASE","allowedCodes":[],"rules":[{"code":"FEMALE","gender":"2",
                "minimumAgeDays":0,"referenceLow":3.9,"referenceHigh":%s,"criticalLow":2.8,"criticalHigh":22.2,"criticalCodes":[]}]}],
                "phrases":[],"requiredChecks":[],"minimumImages":0}}
                """.formatted(expected,high);
    }
    private tools.jackson.databind.node.ObjectNode input(JsonNode task,JsonNode version,String value,String comparator) {
        var input=objectMapper.createObjectNode(); input.put("expectedRevision",task.get("revision").asLong());
        input.put("templateVersionId",version.get("id").asString());
        var row=input.putArray("observations").addObject(); row.put("observationCode","GLU"); row.put("observationName","客户端伪造名称");
        row.put("valueType","NUMBER"); row.put("observationValue",value); row.put("unitCode","MMOL_L_TEST"); row.put("valueComparator",comparator);
        row.put("interpretationCode","N"); row.put("referenceRangeHigh",9999);
        return input;
    }
    private String issue(JsonNode task,JsonNode draft) {
        return "{\"expectedRevision\":"+task.get("revision").asLong()+",\"expectedDraftRevision\":"+draft.get("revision").asLong()+",\"commandId\":\""+UUID.randomUUID()+"\"}";
    }
    private JsonNode startedTask(String catalog,boolean lab) throws Exception {
        String suffix=UUID.randomUUID().toString().substring(0,8);
        var resident=postJson("/api/residents","{\"fullName\":\"医技草稿测试\",\"gender\":\"2\",\"birthDate\":\"1992-08-08\",\"identifiers\":[{\"system\":\"9\",\"value\":\"DRAFT-"+suffix+"\",\"useType\":\"SECONDARY\"}]}",201);
        var encounter=postJson("/api/encounters","{\"residentId\":\""+resident.get("id").asString()+"\",\"organizationId\":\""+ORGANIZATION+"\",\"departmentId\":\""+DEPARTMENT+"\"}",201);
        mockMvc.perform(verifiedEncounterStart(encounter.get("id").asString())).andExpect(status().isOk());
        var request=postJson("/api/encounters/"+encounter.get("id").asString()+"/service-requests","{\"catalogItemId\":\""+catalog+"\",\"quantity\":1,\"priceType\":\"SALE\",\"performerDepartmentId\":\""+DEPARTMENT+"\",\"pricingRequired\":true,\"reason\":\"测试复查\"}",201);
        var values=json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())).andReturn().getResponse().getContentAsString());
        JsonNode task=null; for(var value:values) if(value.get("requestId").equals(request.get("id"))) task=value;
        assertNotNull(task);
        if(lab) task=postJson("/api/diagnostics/tasks/"+task.get("id").asString()+"/collection","{\"expectedRevision\":"+task.get("revision").asLong()+",\"specimenNo\":\"TUBE-"+suffix+"\"}",200);
        return postJson("/api/diagnostics/tasks/"+task.get("id").asString()+"/start","{\"expectedRevision\":"+task.get("revision").asLong()+"}",200);
    }
    private JsonNode task(String id) throws Exception {
        var values=json(mockMvc.perform(get("/api/diagnostics/worklist").with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for(var value:values) if(value.get("id").asString().equals(id)) return value;
        throw new AssertionError("Missing task "+id);
    }
    private JsonNode postJson(String url,String body,int expectedStatus) throws Exception {
        return json(mockMvc.perform(post(url).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }
}
