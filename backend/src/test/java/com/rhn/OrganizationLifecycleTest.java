package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OrganizationLifecycleTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test void transfer_is_atomic_retains_original_and_rejects_stale_revision() throws Exception {
        var person=onboard(); var original=person.path("assignments").get(0);
        String path="/api/platform/assignments/"+original.path("id").asString()+"/transfer";
        var input=Map.of("expectedRevision",original.path("revision").asLong(),"departmentId",DEPARTMENT,
                "positionId","999999999999999999","effectiveDate","2026-10-10","reason","调岗测试");
        send(post(path),input,404);
        var unchanged=detail(person);assertThat(unchanged.path("assignments").size()).isEqualTo(1);
        assertThat(unchanged.path("assignments").get(0).path("validTo").isNull()).isTrue();
        var newPosition=send(post("/api/platform/positions"),Map.of("code",code(),"name","调岗岗位","sdPositionType","CLINICAL"),201);
        var valid=Map.of("expectedRevision",original.path("revision").asLong(),"departmentId",DEPARTMENT,
                "positionId",newPosition.path("id").asString(),"effectiveDate","2026-10-10","reason","调岗测试");
        var saved=send(post(path),valid,200);
        assertThat(saved.path("assignments").size()).isEqualTo(2);
        for(var a:saved.path("assignments")) if(a.path("id").asString().equals(original.path("id").asString()))
            assertThat(a.path("validTo").asString()).isEqualTo("2026-10-09");
        else { assertThat(a.path("validFrom").asString()).isEqualTo("2026-10-10");
            assertThat(a.path("employmentId").asString()).isEqualTo(original.path("employmentId").asString()); }
        var oldEnd=Map.of("expectedRevision",original.path("revision").asLong(),"lastDay","2026-10-08","reason","过期版本");
        send(post("/api/platform/assignments/"+original.path("id").asString()+"/end"),oldEnd,409);
        assertThat(detail(person).path("assignments").size()).isEqualTo(2);
        mockMvc.perform(get("/api/platform/practitioners/{id}/changes",person.path("practitioner").path("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].action").value("TRANSFER_ASSIGNMENT"))
                .andExpect(jsonPath("$[0].actionText").value("调岗"));
    }

    @Test void offboarding_closes_assignments_and_refuses_future_assignments() throws Exception {
        var person=onboard(); var employment=person.path("employments").get(0);var a=person.path("assignments").get(0);
        String end="/api/platform/employments/"+employment.path("id").asString()+"/end";
        var future=Map.of("employmentId",employment.path("id").asString(),"organizationId",ORGANIZATION,"departmentId",DEPARTMENT,
                "positionId",a.path("positionId").asString(),"code",code(),"sdAssignmentType","PRIMARY","primaryAssignment",false,"validFrom","2026-12-01");
        var futureAssignment=send(post("/api/platform/assignments"),future,201);
        var endInput=Map.of("expectedRevision",employment.path("revision").asLong(),"lastDay","2026-10-15","reason","办理离职");
        send(post(end),endInput,409);assertThat(detail(person).path("employments").get(0).path("leaveDate").isNull()).isTrue();
        var voidFuture=new java.util.LinkedHashMap<String,Object>();
        voidFuture.putAll(Map.of("expectedRevision",futureAssignment.path("revision").asLong(),"positionId",a.path("positionId").asString(),
                "sdAssignmentType","PRIMARY","primaryAssignment",false,"validFrom","2026-12-01","sdPersonnelStatus","INACTIVE","reason","撤销未来任职"));
        send(put("/api/platform/assignments/"+futureAssignment.path("id").asString()),voidFuture,200);
        var saved=send(post(end),endInput,200);
        assertThat(saved.path("employments").get(0).path("leaveDate").asString()).isEqualTo("2026-10-15");
        for(var item:saved.path("assignments")) if(item.path("sdPersonnelStatus").asString().equals("ACTIVE"))
            assertThat(item.path("validTo").asString()).isEqualTo("2026-10-15");
    }

    @Test void profile_update_keeps_identity_history_and_owner_revision() throws Exception {
        var profile=send(post("/api/platform/departments/"+DEPARTMENT+"/contacts"),Map.of("sdContactType","PHONE","contactValue","0571-1234567","sdContactUse","OFFICE","primaryContact",false,"sortOrder",9,"validFrom","2026-01-01"),201);
        JsonNode contact=null;for(var item:profile.path("contacts")) if("0571-1234567".equals(item.path("contactValue").asString()))contact=item;
        assertThat(contact).isNotNull();String contactId=contact.path("id").asString();
        var command=Map.of("expectedRevision",profile.path("department").path("revision").asLong(),"reason","更新电话","validFrom","2026-01-01","sdDetailStatus","ACTIVE",
                "sdContactType","PHONE","contactValue","0571-7654321","sdContactUse","OFFICE","primaryContact",false,"sortOrder",9);
        String path="/api/platform/departments/"+DEPARTMENT+"/profile-items/contact/"+contactId;
        var updated=send(put(path),command,200);assertThat(updated.path("contacts").size()).isEqualTo(profile.path("contacts").size());
        assertThat(updated.path("contacts").toString()).contains(contactId,"0571-7654321");
        send(put(path),command,409);
        mockMvc.perform(get("/api/platform/departments/{id}/changes",DEPARTMENT).with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].beforeSnapshot").value(org.hamcrest.Matchers.containsString("0571-1234567")));
    }

    @Test void management_requires_permission_and_stopped_person_cannot_gain_assignment() throws Exception {
        mockMvc.perform(post("/api/platform/practitioners").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("code",code(),"fullName","禁止越权","sdPractGender","0"))))
                .andExpect(status().isForbidden());
        var person=onboard();var p=person.path("practitioner");var a=person.path("assignments").get(0);
        send(post("/api/platform/practitioners/"+p.path("id").asString()+"/status"),Map.of("expectedRevision",p.path("revision").asLong(),"sdPersonnelStatus","INACTIVE"),200);
        send(post("/api/platform/assignments"),Map.of("employmentId",a.path("employmentId").asString(),"organizationId",ORGANIZATION,"departmentId",DEPARTMENT,
                "positionId",a.path("positionId").asString(),"code",code(),"sdAssignmentType","PRIMARY","primaryAssignment",false,"validFrom","2026-10-16"),409);
        send(post("/api/platform/organization-units/"+DEPARTMENT+"/status"),Map.of("expectedRevision",0,"sdOrgStatus","INACTIVE"),409);
    }

    @Test void responsibility_must_fit_assignment_and_be_ended_before_transfer() throws Exception {
        var person=onboard();var a=person.path("assignments").get(0);
        var responsibility=Map.of("assignmentId",a.path("id").asString(),"sdResponsibilityType","DIRECTOR","primaryResponsibility",false,"validFrom","2026-10-01");
        send(post("/api/platform/departments/"+DEPARTMENT+"/responsibilities"),responsibility,400);
        var valid=new java.util.LinkedHashMap<String,Object>(responsibility); valid.put("validFrom","2026-10-03");
        var profile=send(post("/api/platform/departments/"+DEPARTMENT+"/responsibilities"),valid,201);
        JsonNode row=null; for(var item:profile.path("responsibilities")) if(item.path("assignmentId").asString().equals(a.path("id").asString())) row=item;
        assertThat(row).isNotNull();
        send(put("/api/platform/departments/"+DEPARTMENT+"/profile-items/responsibility/"+row.path("id").asString()),
            Map.of("expectedRevision",profile.path("department").path("revision").asLong(),"reason","核对负责人","validFrom","2026-10-03","sdDetailStatus","ACTIVE",
                "assignmentId",a.path("id").asString(),"externalResponsibleName","   ","sdResponsibilityType","DIRECTOR","primaryResponsibility",false),200);
        send(post("/api/platform/assignments/"+a.path("id").asString()+"/end"),Map.of("expectedRevision",a.path("revision").asLong(),"lastDay","2026-10-15","reason","结束任职"),409);
        assertThat(detail(person).path("assignments").get(0).path("validTo").isNull()).isTrue();
    }

    private JsonNode onboard() throws Exception {
        String position=jdbc.queryForObject("select min(ID_POS) from RHN_SYS_POS where ID_TNT=? and SD_STATUS='ACTIVE'",Long.class,Long.valueOf(TENANT)).toString();
        return send(post("/api/platform/practitioners/onboarding"),Map.of("code",code(),"fullName","生命周期测试","sdPractGender","0","organizationId",ORGANIZATION,"departmentId",DEPARTMENT,"positionId",position,"hireDate","2026-10-03"),201);
    }

    @Test void unified_maintenance_is_atomic_and_results_are_maintained_without_workflow() throws Exception {
        var initial=json(mockMvc.perform(get("/api/platform/departments/{id}",DEPARTMENT).with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        var owner=initial.path("department");long revision=owner.path("revision").asLong();
        var details=new java.util.LinkedHashMap<String,Object>();
        for(String key:java.util.List.of("name","sdOrgType","sdDepartmentType","sdDepartmentProperty","validFrom")) details.put(key,owner.path(key).asString());
        details.put("virtual",owner.path("virtual").asBoolean());details.put("sortOrder",owner.path("sortOrder").asInt());
        details.put("shortName","统一维护测试");
        var contact=Map.of("expectedRevision",revision,"reason","统一修改","validFrom","2026-10-16","sdDetailStatus","ACTIVE",
            "sdContactType","PHONE","contactValue","0571-9876543","sdContactUse","OFFICE");
        var capability=new java.util.LinkedHashMap<String,Object>(Map.of("expectedRevision",revision,"reason","统一修改","validFrom","2026-10-16",
            "sdDetailStatus","ACTIVE","sdCapabilityType","OUTPATIENT","sdVerifyStatus","PENDING"));
        var items=java.util.List.of(Map.of("section","contact","values",contact),Map.of("section","capability","values",capability));
        var command=Map.of("expectedRevision",revision,"details",details,"changes",items,"reason","统一修改");
        String path="/api/platform/departments/"+DEPARTMENT+"/maintenance";
        send(put(path),command,400);
        var unchanged=json(mockMvc.perform(get("/api/platform/departments/{id}",DEPARTMENT).with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(unchanged.path("department").path("revision").asLong()).isEqualTo(revision);
        assertThat(unchanged.path("contacts").size()).isEqualTo(initial.path("contacts").size());
        capability.put("sdVerifyStatus","VERIFIED");
        var saved=send(put(path),command,200);
        assertThat(saved.path("contacts").size()).isEqualTo(initial.path("contacts").size()+1);
        assertThat(saved.path("capabilities").size()).isEqualTo(initial.path("capabilities").size()+1);
        assertThat(saved.path("department").path("shortName").asString()).isEqualTo("统一维护测试");
        assertThat(saved.path("capabilities").toString()).contains("符合");
        send(put(path),command,409);
        JsonNode addedContact=null;
        for(var row:saved.path("contacts")) if(row.path("contactValue").asString().equals("0571-9876543")) addedContact=row;
        assertThat(addedContact).isNotNull();
        var correctedContact=new java.util.LinkedHashMap<String,Object>(contact);correctedContact.put("contactValue","0571-1111111");
        var badRows=java.util.List.of(Map.of("section","contact","id",addedContact.path("id").asString(),"values",correctedContact),
            Map.of("section","capability","id","999999999999999999","values",capability));
        send(put(path),Map.of("expectedRevision",saved.path("department").path("revision").asLong(),"details",details,"changes",badRows,"reason","核实归属"),404);
        var afterFailedUpdate=json(mockMvc.perform(get("/api/platform/departments/{id}",DEPARTMENT).with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(afterFailedUpdate.path("department").path("revision").asLong()).isEqualTo(saved.path("department").path("revision").asLong());
        assertThat(afterFailedUpdate.path("contacts").toString()).contains("0571-9876543").doesNotContain("0571-1111111");
        mockMvc.perform(put(path).with(rhn()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(command)))
            .andExpect(status().isForbidden());
    }
    private JsonNode detail(JsonNode person) throws Exception {
        return json(mockMvc.perform(get("/api/platform/practitioners/{id}",person.path("practitioner").path("id").asString()).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    private String code() { return "LIFE_"+UUID.randomUUID().toString().replace("-",""); }
    private JsonNode send(MockHttpServletRequestBuilder request,Object input,int expected) throws Exception {
        return json(mockMvc.perform(request.with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)))
                .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
}
