package com.rhn;

import com.rhn.ai.application.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RecordQualityDecisionTest extends RhnIntegrationTestSupport {
    @MockitoBean DecisionModelGateway gateway;
    @MockitoBean ClinicalAiRuntimePolicy policy;
    @Autowired JdbcTemplate jdbc;
    @BeforeEach void setup() {
        when(policy.text(anyLong(),anyString(),anyString())).thenAnswer(a->a.getArgument(2));
        when(policy.text(anyLong(),eq("decision-mode"),eq("DISABLED"))).thenReturn("ASSIST");
        when(policy.number(anyLong(),anyString(),anyLong())).thenAnswer(a->a.getArgument(2));
        when(policy.booleanValue(anyLong(),anyString(),anyBoolean())).thenReturn(true);
        when(policy.secret(anyLong(),eq("decision-api-key"),isNull())).thenReturn("synthetic-key");
        var runtime=mock(ClinicalAssistantSettings.class);when(runtime.availableFor(any())).thenReturn(true);
        when(runtime.mode()).thenReturn(ClinicalAssistantSettings.Mode.LOCAL_ASSIST);
        when(runtime.featuresFor(any())).thenReturn(List.of("CLINICAL_RECORD_DRAFT"));when(policy.current(any())).thenReturn(runtime);
        when(gateway.decide(any(),any())).thenAnswer(a->{
            DecisionModelGateway.Request request=a.getArgument(0);var answers=new LinkedHashMap<String,DecisionModelGateway.ChoiceAnswer>();
            for(var q:request.questions()) {
                String choice=q.id().equals("ONSET")?"ASK":q.criteria().containsKey("PROVIDED")?"PROVIDED":"CONSISTENT";
                answers.put(q.id(),new DecisionModelGateway.ChoiceAnswer(choice,Map.of(choice,1d),.99));
            }
            return new DecisionModelGateway.Result("synthetic-trace","synthetic-model",answers,1);
        });
    }
    @Test void advertisesQualityReviewOnlyWhenSceneModelAndWorkScopeAreEnabled() throws Exception {
        String path="/api/ai/clinical-assistant/capabilities";
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.features",org.hamcrest.Matchers.hasItem("RECORD_QUALITY_REVIEW")));
        when(policy.booleanValue(anyLong(),eq(DecisionScene.RECORD_QUALITY.settingKey()),eq(false))).thenReturn(false);
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(jsonPath("$.features",org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("RECORD_QUALITY_REVIEW"))));
        when(policy.booleanValue(anyLong(),eq(DecisionScene.RECORD_QUALITY.settingKey()),eq(false))).thenReturn(true);
        when(policy.text(anyLong(),eq("decision-mode"),eq("DISABLED"))).thenReturn("DISABLED");
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(jsonPath("$.features",org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("RECORD_QUALITY_REVIEW"))));
        when(policy.text(anyLong(),eq("decision-mode"),eq("DISABLED"))).thenReturn("SHADOW");
        when(policy.secret(anyLong(),eq("decision-api-key"),isNull())).thenReturn(null);
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(jsonPath("$.features",org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("RECORD_QUALITY_REVIEW"))));
        when(policy.secret(anyLong(),eq("decision-api-key"),isNull())).thenReturn("synthetic-key");
        var runtime=policy.current(null);when(runtime.availableFor(any())).thenReturn(false);
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(jsonPath("$.features",org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("RECORD_QUALITY_REVIEW"))));
        verifyNoInteractions(gateway);
    }
    @Test void savesVerifiedModifiedFeedbackIdempotentlyAndRestoresTheClosure() throws Exception {
        String encounter=encounter();saveNote(encounter,"咳嗽");
        var assessed=assess(encounter);String run=assessed.path("runId").asString();
        assertThat(assessed.path("findings")).hasSize(1);
        var adopt="{\"commandCode\":\"accept-onset\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}";
        feedback(encounter,run,adopt,200);feedback(encounter,run,adopt,200);
        mockMvc.perform(post(root(encounter)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fields\":{\"chiefComplaint\":\"咳嗽\"}}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RECORD_QUALITY_FEEDBACK_PENDING"));
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_AI_REC_FB where ID_RUN=?",Integer.class,Long.valueOf(run))).isEqualTo(1);
        feedback(encounter,run,adopt.replace("ADOPTED","DISMISSED"),409);
        saveNote(encounter,"咳嗽三天");var doc=document(encounter);
        var saved=savedRequest(doc,"save-feedback");
        feedback(encounter,run,saved.replace("\"documentVersion\":"+doc.path("currentVersion").asInt(),"\"documentVersion\":999"),409);
        var response=feedback(encounter,run,saved,200);
        assertThat(response.path(0).path("action").asString()).isEqualTo("MODIFIED");
        assertThat(response.path(0).path("changedFieldHashes").has("presentIllness")).isTrue();
        assertThat(response.path(0).path("documentId").asString()).isEqualTo(doc.path("id").asString());
        feedback(encounter,run,saved,200);
        assertThat(jdbc.queryForObject("select count(*) from RHN_AUD_AI_REC_FB where ID_RUN=?",Integer.class,Long.valueOf(run))).isEqualTo(2);
        // GET uses the same authenticated owner and scope as POST.
        var latest=json(mockMvc.perform(get(root(encounter)).with(rhnWorkContext())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(latest.path("feedback")).hasSize(2);
        var observed=json(mockMvc.perform(get("/api/ai/administration/decision-observations").param("scene","RECORD_QUALITY").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(observed.path("feedback").path("modified").asInt()).isGreaterThanOrEqualTo(1);
        var detail=json(mockMvc.perform(get("/api/ai/administration/decision-observations/{id}",run).with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(detail.path("feedback")).hasSize(2);
    }
    @Test void distinguishesUnchangedSaveAndDismissalFromModification() throws Exception {
        String encounter=encounter();saveNote(encounter,"咳嗽");var assessed=assess(encounter);String run=assessed.path("runId").asString();
        feedback(encounter,run,"{\"commandCode\":\"adopt\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}",200);
        saveNote(encounter,"咳嗽");var response=feedback(encounter,run,savedRequest(document(encounter),"save"),200);
        assertThat(response.path(0).path("action").asString()).isEqualTo("UNCHANGED");
        feedback(encounter,run,"{\"commandCode\":\"dismiss\",\"action\":\"DISMISSED\",\"findingCode\":\"ONSET\"}",200);
        feedback(encounter,run,savedRequest(document(encounter),"save-after-dismiss"),409);
    }
    @Test void rejectsForgedFindingsCrossEncounterAndUnsavedVersions() throws Exception {
        String encounter=encounter();saveNote(encounter,"咳嗽");var assessed=assess(encounter);String run=assessed.path("runId").asString();
        feedback(encounter,run,"{\"commandCode\":\"fake\",\"action\":\"ADOPTED\",\"findingCode\":\"FAKE\"}",400);
        feedback(encounter,run,"{\"commandCode\":\"adopt\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}",200);
        feedback(encounter,run,savedRequest(document(encounter),"unsaved"),409);
        feedback(encounter(),run,"{\"commandCode\":\"other\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}",403);
        mockMvc.perform(post(root(encounter)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"fields\":{\"patientName\":\"不允许\"}}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RECORD_QUALITY_FIELDS_INVALID"));
    }
    @Test void shadowRecordsClinicalSnapshotButCannotBeAdoptedOrWriteDocuments() throws Exception {
        String encounter=encounter();saveNote(encounter,"咳嗽");int version=document(encounter).path("currentVersion").asInt();
        when(policy.text(anyLong(),eq("decision-mode"),eq("DISABLED"))).thenReturn("SHADOW");
        var assessed=assess(encounter);assertThat(assessed.path("findings")).isEmpty();assertThat(assessed.path("outcome").asString()).isEqualTo("SHADOW");
        feedback(encounter,assessed.path("runId").asString(),"{\"commandCode\":\"shadow\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}",404);
        assertThat(document(encounter).path("currentVersion").asInt()).isEqualTo(version);
        mockMvc.perform(post(root(encounter)).header("X-Tenant-Id",TENANT)).andExpect(status().isUnauthorized());
    }
    @Test void runtimeContractIncludesFeedbackLabelsAndStringIds() throws Exception {
        String document=mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var schemas=json(document).path("components").path("schemas");
        var idTypes=new ArrayList<String>();
        schemas.path("RecordQualityResult").path("properties").path("runId").path("type").forEach(type->idTypes.add(type.asString()));
        assertThat(idTypes).containsExactlyInAnyOrder("string","null");
        assertThat(schemas.path("RecordQualityFeedback").path("properties").has("actionText")).isTrue();
        String export=System.getProperty("rhn.record-quality.openapi-export");
        if(export!=null) java.nio.file.Files.writeString(java.nio.file.Path.of(export),document);
    }
    @Test void unknownShadowAnswersCountAsUncertainAndCannotCreateAdvice() throws Exception {
        String encounter=encounter();
        when(policy.text(anyLong(),eq("decision-mode"),eq("DISABLED"))).thenReturn("SHADOW");
        doAnswer(a->{
            DecisionModelGateway.Request request=a.getArgument(0);var answers=new LinkedHashMap<String,DecisionModelGateway.ChoiceAnswer>();
            request.questions().forEach(q->answers.put(q.id(),new DecisionModelGateway.ChoiceAnswer("UNKNOWN",Map.of("UNKNOWN",1d),1)));
            return new DecisionModelGateway.Result("unknown","synthetic",answers,1);
        }).when(gateway).decide(any(),any());
        var result=assess(encounter);assertThat(result.path("findings")).isEmpty();
        assertThat(jdbc.queryForObject("select FG_UNCERT from RHN_AUD_AI_DCSN_RUN where ID_RUN=?",Integer.class,result.path("runId").asLong())).isEqualTo(1);
    }
    private JsonNode assess(String id) throws Exception {return json(mockMvc.perform(post(root(id)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fields\":{\"chiefComplaint\":\"咳嗽\",\"presentIllness\":\"咳嗽\"}}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());}
    @Test void whitespaceCleanupIsNotPhysicianModificationAndNullValuesAreRejected() throws Exception {
        String encounter=encounter();
        var assessed=json(mockMvc.perform(post(root(encounter)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"fields":{"chiefComplaint":" 咳嗽 ","presentIllness":" 咳嗽 "}}
                        """))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String run=assessed.path("runId").asString();
        feedback(encounter,run,"{\"commandCode\":\"adopt\",\"action\":\"ADOPTED\",\"findingCode\":\"ONSET\"}",200);
        saveNote(encounter,"咳嗽");
        assertThat(feedback(encounter,run,savedRequest(document(encounter),"save"),200).path(0).path("action").asString()).isEqualTo("UNCHANGED");
        mockMvc.perform(post(root(encounter)).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content("{\"fields\":{\"presentIllness\":null}}"))
                .andExpect(status().isBadRequest());
    }
    private JsonNode feedback(String id,String run,String body,int status) throws Exception {return json(mockMvc.perform(post(root(id)+"/"+run+"/feedback")
            .with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().is(status)).andReturn().getResponse().getContentAsString());}
    private String savedRequest(JsonNode doc,String command) {return "{\"commandCode\":\""+command+"\",\"action\":\"SAVED\",\"documentId\":\""+doc.path("id").asString()+"\",\"documentVersion\":"+doc.path("currentVersion").asInt()+"}";}
    private String root(String id) {return "/api/ai/clinical-assistant/encounters/"+id+"/record-quality";}
    private JsonNode document(String id) throws Exception {return json(mockMvc.perform(get("/api/clinical-documents").param("encounterId",id).with(rhnWorkContext()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path(0);}
    private void saveNote(String id,String illness) throws Exception {mockMvc.perform(put("/api/encounters/{id}/clinical-record",id).with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"chiefComplaint\":\"咳嗽\",\"presentIllness\":\""+illness+"\",\"systolic\":120,\"diastolic\":80,\"diagnoses\":[]}"))
            .andExpect(status().isOk());}
    private String encounter() throws Exception {
        String resident=json(mockMvc.perform(post("/api/residents").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"合成核查样本\",\"gender\":\"2\",\"birthDate\":\"1988-08-08\",\"identifiers\":[{\"system\":\"9\",\"value\":\""+UUID.randomUUID()+"\",\"useType\":\"SECONDARY\"}]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        String id=json(mockMvc.perform(post("/api/encounters").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"residentId\":\""+resident+"\",\"organizationId\":\""+ORGANIZATION+"\",\"departmentId\":\""+DEPARTMENT+"\",\"idempotencyCode\":\""+UUID.randomUUID()+"\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).path("id").asString();
        mockMvc.perform(verifiedEncounterStart(id)).andExpect(status().isOk());return id;
    }
}
