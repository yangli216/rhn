package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BillingReliefManagementTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    static final String DRAFT = """
            {
              "timing":"POST_INSURANCE","sponsor":"GOVERNMENT","payerCode":"MZJ","payerName":"区民政局",
              "scope":{"organizationIds":[],"scenes":["OUTPATIENT","INPATIENT","OUTPATIENT"]},
              "effectiveFrom":"2026-01-01","priority":20,"mutexGroup":"civil","stackable":true,
              "qualificationMode":"ANY","insuredApplicable":true,"onceMaxAmount":200,
              "quotaPeriod":"YEAR","periodMaxAmount":1000,"shareAcrossScenes":true,
              "rules":[
                {"feeScope":"ALL","method":"RATIO","ratio":0.3},
                {"feeScope":"ACCOUNTING_CATEGORY","scopeValue":"SURGERY","excluded":true}
              ],
              "qualifications":[
                {"source":"ROSTER","qualificationType":"MINIMUM_LIVING"},
                {"source":"ROSTER","qualificationType":"EXTREME_POVERTY"}
              ]
            }
            """;

    JsonNode send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body,
                  int expected) throws Exception {
        var result = mockMvc.perform(request.with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                        .content(body == null ? "" : body))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return result.isBlank() ? null : objectMapper.readTree(result);
    }

    String revision(JsonNode policy) { return "{\"expectedRevision\":" + policy.get("revision").asLong() + "}"; }

    @Test
    void policy_lifecycle_creates_drafts_publishes_versions_and_guards_revisions() throws Exception {
        JsonNode created = send(post("/api/billing/relief/policies"), """
                {"code":"civil-aid","name":"民政救助","description":"低保与特困人员门诊住院救助","draft":%s}
                """.formatted(DRAFT), 201);
        String id = created.get("id").asString();
        assertThat(created.get("code").asString()).isEqualTo("CIVIL-AID");
        assertThat(created.get("status").asString()).isEqualTo("DRAFT");
        JsonNode draft = created.get("draft");
        assertThat(draft.get("versionNo").asInt()).isEqualTo(1);
        assertThat(draft.get("mutexGroup").asString()).isEqualTo("CIVIL");
        assertThat(draft.get("scope").get("scenes").toString()).isEqualTo("[\"INPATIENT\",\"OUTPATIENT\"]");
        assertThat(draft.get("rules").get(1).get("scopeName").asString()).isEqualTo("手术费");
        assertThat(draft.get("qualifications")).hasSize(2);

        send(post("/api/billing/relief/policies"), """
                {"code":"CIVIL-AID","name":"重复","draft":%s}""".formatted(DRAFT), 409);

        JsonNode published = send(post("/api/billing/relief/policies/{id}/publish", id), revision(created), 200);
        assertThat(published.get("status").asString()).isEqualTo("ACTIVE");
        assertThat(published.get("current").get("status").asString()).isEqualTo("PUBLISHED");
        assertThat(published.get("draft").isNull()).isTrue();
        send(post("/api/billing/relief/policies/{id}/suspend", id), revision(created), 409);

        // 已发布后再编辑：生成第 2 版草稿，当前版本不变。
        String revised = DRAFT.replace("\"ratio\":0.3", "\"ratio\":0.5");
        JsonNode second = send(put("/api/billing/relief/policies/{id}/draft", id), """
                {"expectedRevision":%d,"name":"民政救助（2027）","draft":%s}
                """.formatted(published.get("revision").asLong(), revised), 200);
        assertThat(second.get("draft").get("versionNo").asInt()).isEqualTo(2);
        assertThat(second.get("current").get("rules").get(0).get("ratio").decimalValue()).isEqualByComparingTo("0.3");
        assertThat(second.get("draft").get("rules").get(0).get("ratio").decimalValue()).isEqualByComparingTo("0.5");

        JsonNode secondPublished = send(post("/api/billing/relief/policies/{id}/publish", id), revision(second), 200);
        assertThat(secondPublished.get("current").get("versionNo").asInt()).isEqualTo(2);
        assertThat(secondPublished.get("versions").get(1).get("status").asString()).isEqualTo("SUPERSEDED");

        JsonNode suspended = send(post("/api/billing/relief/policies/{id}/suspend", id), revision(secondPublished), 200);
        assertThat(suspended.get("status").asString()).isEqualTo("SUSPENDED");
        JsonNode resumed = send(post("/api/billing/relief/policies/{id}/resume", id), revision(suspended), 200);
        assertThat(resumed.get("status").asString()).isEqualTo("ACTIVE");

        JsonNode list = send(get("/api/billing/relief/policies"), null, 200);
        assertThat(list.get(0).get("currentVersionNo").asInt()).isEqualTo(2);
        assertThat(list.get(0).get("timing").asString()).isEqualTo("POST_INSURANCE");
    }

    @Test
    void draft_validation_rejects_inconsistent_configuration() throws Exception {
        String body = """
                {"code":"P-%s","name":"测试","draft":%s}""";
        JsonNode unknownCategory = send(post("/api/billing/relief/policies"), body.formatted("1",
                DRAFT.replace("\"SURGERY\"", "\"NOT_A_CATEGORY\"")), 400);
        assertThat(unknownCategory.get("code").asString()).isEqualTo("RELIEF_RULE_CATEGORY_INVALID");

        JsonNode noScene = send(post("/api/billing/relief/policies"), body.formatted("2",
                DRAFT.replace("\"scenes\":[\"OUTPATIENT\",\"INPATIENT\",\"OUTPATIENT\"]", "\"scenes\":[]")), 400);
        assertThat(noScene.get("code").asString()).isEqualTo("RELIEF_POLICY_SCENE_REQUIRED");

        JsonNode badType = send(post("/api/billing/relief/policies"), body.formatted("3",
                DRAFT.replace("\"EXTREME_POVERTY\"", "\"UNKNOWN_TYPE\"")), 400);
        assertThat(badType.get("code").asString()).isEqualTo("RELIEF_QUALIFICATION_TYPE_INVALID");

        JsonNode manualBeforeInsurance = send(post("/api/billing/relief/policies"), body.formatted("4",
                DRAFT.replace("\"POST_INSURANCE\"", "\"PRE_INSURANCE\"")
                        .replace("{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.3}",
                                "{\"feeScope\":\"ALL\",\"method\":\"MANUAL\"}")), 400);
        assertThat(manualBeforeInsurance.get("code").asString()).isEqualTo("RELIEF_RULE_MANUAL_TIMING");

        JsonNode ratio = send(post("/api/billing/relief/policies"), body.formatted("5",
                DRAFT.replace("\"ratio\":0.3", "\"ratio\":1.5")), 400);
        assertThat(ratio.get("message").asString()).contains("不超过 1");

        // 只有排除规则的草稿可以保存，但不能发布。
        JsonNode onlyExclusion = send(post("/api/billing/relief/policies"), body.formatted("6",
                DRAFT.replace("{\"feeScope\":\"ALL\",\"method\":\"RATIO\",\"ratio\":0.3},", "")), 201);
        JsonNode publish = send(post("/api/billing/relief/policies/{id}/publish", onlyExclusion.get("id").asString()),
                revision(onlyExclusion), 400);
        assertThat(publish.get("code").asString()).isEqualTo("RELIEF_POLICY_RULE_REQUIRED");

        JsonNode stale = send(put("/api/billing/relief/policies/{id}/draft", onlyExclusion.get("id").asString()), """
                {"expectedRevision":%d,"name":"测试","draft":%s}
                """.formatted(onlyExclusion.get("revision").asLong() + 5, DRAFT), 409);
        assertThat(stale.get("code").asString()).isEqualTo("REVISION_CONFLICT");
    }

    @Test
    void roster_entries_reject_overlaps_and_import_matches_residents_by_identifier() throws Exception {
        String residentId = createResident("陈晨", "330102196601011111");
        createResident("李雷", "330102196601011138");

        JsonNode entry = send(post("/api/billing/relief/roster"), """
                {"qualificationType":"MINIMUM_LIVING","residentId":"%s","effectiveFrom":"2026-01-01",
                 "effectiveTo":"2026-12-31","evidenceNo":"DB-2026-001"}
                """.formatted(residentId), 201);
        assertThat(entry.get("residentName").asString()).isEqualTo("陈晨");
        assertThat(entry.get("status").asString()).isEqualTo("ACTIVE");

        JsonNode overlap = send(post("/api/billing/relief/roster"), """
                {"qualificationType":"MINIMUM_LIVING","residentId":"%s","effectiveFrom":"2026-06-01"}
                """.formatted(residentId), 409);
        assertThat(overlap.get("code").asString()).isEqualTo("RELIEF_ROSTER_OVERLAP");

        String importBody = """
                {"batchCode":"MZ-202610","qualificationType":"MINIMUM_LIVING","dryRun":%s,"rows":[
                  {"rowNo":2,"identifierValue":"330102196601011138","residentName":"李雷","effectiveFrom":"2026-10-01"},
                  {"rowNo":3,"identifierValue":"330102196601011111","effectiveFrom":"2026-03-01","effectiveTo":"2026-04-30"},
                  {"rowNo":4,"identifierValue":"110101199001011234","effectiveFrom":"2026-10-01"},
                  {"rowNo":5,"identifierValue":"330102196601011138","residentName":"韩梅梅","effectiveFrom":"2026-10-01"},
                  {"rowNo":6,"identifierValue":"330102196601011138","effectiveFrom":"2026-11-01"}
                ]}
                """;
        JsonNode preview = send(post("/api/billing/relief/roster/import"), importBody.formatted("true"), 200);
        assertThat(preview.get("acceptedRows").asInt()).isEqualTo(1);
        assertThat(preview.get("importedRows").asInt()).isZero();
        assertThat(preview.get("rows").get(1).get("message").asString()).isEqualTo("已有有效期重叠的资格记录");
        assertThat(preview.get("rows").get(2).get("message").asString()).isEqualTo("未在居民主索引中找到该证件");
        assertThat(preview.get("rows").get(3).get("message").asString()).startsWith("姓名与主索引不一致");
        assertThat(preview.get("rows").get(4).get("message").asString()).isEqualTo("与文件中其他行的有效期重叠");

        JsonNode imported = send(post("/api/billing/relief/roster/import"), importBody.formatted("false"), 200);
        assertThat(imported.get("importedRows").asInt()).isEqualTo(1);
        assertThat(imported.get("rows").get(0).get("status").asString()).isEqualTo("IMPORTED");
        send(post("/api/billing/relief/roster/import"), importBody.formatted("false"), 409);

        JsonNode batch = send(get("/api/billing/relief/roster").queryParam("importBatch", "MZ-202610"), null, 200);
        assertThat(batch).hasSize(1);
        assertThat(batch.get(0).get("residentName").asString()).isEqualTo("李雷");

        JsonNode updated = send(put("/api/billing/relief/roster/{id}", entry.get("id").asString()), """
                {"expectedRevision":%d,"effectiveFrom":"2026-01-01","effectiveTo":"2027-06-30","evidenceNo":"DB-2026-001A"}
                """.formatted(entry.get("revision").asLong()), 200);
        assertThat(updated.get("effectiveTo").asString()).isEqualTo("2027-06-30");

        JsonNode revoked = send(post("/api/billing/relief/roster/{id}/revoke", entry.get("id").asString()), """
                {"expectedRevision":%d,"reason":"民政复核取消低保资格"}
                """.formatted(updated.get("revision").asLong()), 200);
        assertThat(revoked.get("status").asString()).isEqualTo("REVOKED");
        // 停用后同期可以重新登记。
        send(post("/api/billing/relief/roster"), """
                {"qualificationType":"MINIMUM_LIVING","residentId":"%s","effectiveFrom":"2026-06-01"}
                """.formatted(residentId), 201);
    }

    @Test
    void reading_needs_billing_access_and_writing_needs_relief_permissions() throws Exception {
        // 收回惠民政策管理员角色后，收费人员仍可查看，但不能维护政策或名单。
        var grant = jdbc.queryForMap("select * from RHN_SYS_USER_ROLE_ASSIGN where ID_USER_ROLE_ASSIGN = 362387869940331");
        jdbc.update("delete from RHN_SYS_USER_ROLE_ASSIGN where ID_USER_ROLE_ASSIGN = 362387869940331");
        try {
            mockMvc.perform(get("/api/billing/relief/policies").with(rhnWorkContext())).andExpect(status().isOk());
            mockMvc.perform(get("/api/billing/relief/roster").with(rhnWorkContext())).andExpect(status().isOk());
            send(post("/api/billing/relief/policies"), "{\"code\":\"X\",\"name\":\"X\",\"draft\":" + DRAFT + "}", 403);
            send(post("/api/billing/relief/roster/import"), """
                    {"batchCode":"B1","qualificationType":"MINIMUM_LIVING","rows":[{"rowNo":1,"identifierValue":"1"}]}
                    """, 403);
        } finally {
            new SimpleJdbcInsert(jdbc).withTableName("RHN_SYS_USER_ROLE_ASSIGN")
                    .execute(grant);
        }
    }

    private String createResident(String name, String nationalId) throws Exception {
        String body = mockMvc.perform(post("/api/residents").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"%s","nationalId":"%s","gender":"1","birthDate":"1966-01-01","phone":"13800139001"}
                                """.formatted(name, nationalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asString();
    }
}
