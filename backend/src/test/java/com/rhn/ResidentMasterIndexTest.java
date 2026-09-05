package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ResidentMasterIndexTest extends RhnIntegrationTestSupport {

    @Test
    void identifiers_source_matching_merge_and_split_remain_reversible() throws Exception {
        mockMvc.perform(get("/api/residents")
                        .with(rhn())
                        .queryParam("query", "195501010000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].healthRecordNo").value("RHN-LEGACY-0001"))
                .andExpect(jsonPath("$[0].identifiers[0].system").value("1"));

        String survivorId = createResident("陈晨", "330102196601011111", null);
        String duplicateId = createResident("陈晨", null, """
                [
                  {"system":"NATIONAL_ID","value":"330102196601011112","useType":"OFFICIAL"},
                  {"system":"HOSPITAL_MRN","value":"MRN-90001","useType":"SECONDARY"}
                ]
                """);

        String mergeBody = mockMvc.perform(post("/api/residents/{id}/merge", survivorId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"mergedResidentId":"%s","reason":"重复建档核实合并"}
                                """.formatted(duplicateId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String mergeHistoryId = objectMapper.readTree(mergeBody).get("mergeHistoryId").asText();

        mockMvc.perform(get("/api/residents/{id}", duplicateId)
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("MERGED"))
                .andExpect(jsonPath("$.mergedIntoId").value(survivorId))
                .andExpect(jsonPath("$.identifiers.length()").value(0));

        mockMvc.perform(post("/api/encounters")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "residentId":"%s",
                                  "organizationId":"%s",
                                  "departmentId":"%s"
                                }
                                """.formatted(duplicateId, ORGANIZATION, DEPARTMENT)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.residentId").value(survivorId));

        mockMvc.perform(post("/api/residents/merges/{id}/split", mergeHistoryId)
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reason":"发现两人为同名不同个体，撤销合并"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.mergedIntoId").doesNotExist())
                .andExpect(jsonPath("$.identifiers.length()").value(2));

        mockMvc.perform(post("/api/residents/source-records")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sourceOrganizationId":"%s",
                                  "sourceSystem":"HIS-A",
                                  "sourceRecordId":"PATIENT-90001",
                                  "fullName":"陈晨",
                                  "gender":"MALE",
                                  "birthDate":"1966-01-01",
                                  "identifiers":[
                                    {"system":"HOSPITAL_MRN","value":"MRN-90001","useType":"SECONDARY"}
                                  ]
                                }
                                """.formatted(ORGANIZATION)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.matchStatus").value("MATCHED"))
                .andExpect(jsonPath("$.residentId").value(duplicateId));
    }

    @Test
    void resident_page_query_supports_filtering_and_pagination() throws Exception {
        String testName = "分页测试" + Long.toString(System.currentTimeMillis()).substring(8);
        String id1 = createResident(testName + "甲", "330102197001018881", null);
        String id2 = createResident(testName + "乙", "330102197001018882", null);

        mockMvc.perform(get("/api/residents/page")
                        .with(rhn())
                        .queryParam("query", testName)
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].fullName").value(testName + "乙"))
                .andExpect(jsonPath("$.content[0].maskedNationalId").isNotEmpty())
                .andExpect(jsonPath("$.content[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.content[1].fullName").value(testName + "甲"));

        mockMvc.perform(get("/api/residents/page")
                        .with(rhn())
                        .queryParam("query", testName + "甲")
                        .queryParam("gender", "MALE")
                        .queryParam("status", "ACTIVE")
                        .queryParam("page", "0")
                        .queryParam("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(id1));

        mockMvc.perform(get("/api/residents/page")
                        .with(rhn())
                        .queryParam("gender", "FEMALE")
                        .queryParam("query", testName))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    private String createResident(String name, String nationalId, String identifiers) throws Exception {
        String nationalIdField = nationalId == null ? "" : "\"nationalId\":\"" + nationalId + "\",";
        String identifiersField = identifiers == null ? "" : ",\"identifiers\":" + identifiers;
        String body = mockMvc.perform(post("/api/residents")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName":"%s",
                                  %s
                                  "gender":"MALE",
                                  "birthDate":"1966-01-01",
                                  "phone":"13800139001"%s
                                }
                                """.formatted(name, nationalIdField, identifiersField)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }
}
