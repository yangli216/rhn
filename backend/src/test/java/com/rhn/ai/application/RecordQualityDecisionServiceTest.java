package com.rhn.ai.application;

import com.rhn.ai.api.RecordQualityContracts.*;
import com.rhn.ai.infrastructure.RecordQualityStore;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.shared.context.*;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.*;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RecordQualityDecisionServiceTest {
    final ClinicalAiRuntimePolicy policy=mock(ClinicalAiRuntimePolicy.class);
    final DecisionModelGateway gateway=mock(DecisionModelGateway.class);
    final DecisionObservationRecorder observations=mock(DecisionObservationRecorder.class);
    final RecordQualityStore store=mock(RecordQualityStore.class);
    final EncounterDirectory encounters=mock(EncounterDirectory.class);
    final ClinicalDocumentDirectory documents=mock(ClinicalDocumentDirectory.class);
    final ExecutionContextProvider contexts=mock(ExecutionContextProvider.class);
    final JsonCodec json=mock(JsonCodec.class);
    final ExecutionContext c=new ExecutionContext(1L,2L,"doctor","correlation",Set.of("OUTPATIENT_RECEPTION.ACCESS"),10L,11L,"DEPARTMENT",Set.of(10L),Set.of(11L),12L);
    final RecordQualityDecisionService service=new RecordQualityDecisionService(policy,gateway,observations,store,encounters,documents,contexts,json);
    @BeforeEach void setup() {
        when(contexts.requireCurrent()).thenReturn(c);
        when(encounters.requireAccessible(30L)).thenReturn(new EncounterDirectory.EncounterSnapshot(30L,1L,99L,10L,11L,"E","doctor","IN_PROGRESS",0,"全科",java.time.Instant.now()));
        when(documents.findEncounterDocumentAnchor(anyLong(),anyString())).thenReturn(Optional.empty());
        when(policy.text(anyLong(),anyString(),anyString())).thenAnswer(a->a.getArgument(2));
        when(policy.number(anyLong(),anyString(),anyLong())).thenAnswer(a->a.getArgument(2));
        when(policy.booleanValue(1L,DecisionScene.RECORD_QUALITY.settingKey(),false)).thenReturn(true);
        when(policy.text(1L,"decision-mode","DISABLED")).thenReturn("ASSIST");
        when(policy.secret(1L,"decision-api-key",null)).thenReturn("key");
        var runtime=mock(ClinicalAssistantSettings.class);when(runtime.availableFor(c)).thenReturn(true);when(policy.current(c)).thenReturn(runtime);
        var mapper=JsonMapper.builder().build();when(json.write(any())).thenAnswer(a->mapper.writeValueAsString(a.getArgument(0)));
        when(json.readTree(anyString())).thenAnswer(a->mapper.readTree((String)a.getArgument(0)));
        when(observations.record(any(),any(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyBoolean(),anyDouble(),anyString(),any(),any(),anyList(),anyList(),anyString(),isNull())).thenReturn(50L);
        when(gateway.decide(any(),any())).thenAnswer(a->answer(a.getArgument(0),.99));
    }
    private DecisionModelGateway.Result answer(DecisionModelGateway.Request request,double confidence) {
        var answers=new LinkedHashMap<String,DecisionModelGateway.ChoiceAnswer>();
        for(var q:request.questions()) {
            String choice=q.id().equals("ONSET")?"ASK":q.id().equals("ALLERGY_CONFLICT")?"CONFLICT":q.criteria().containsKey("PROVIDED")?"PROVIDED":"CONSISTENT";
            answers.put(q.id(),new DecisionModelGateway.ChoiceAnswer(choice,Map.of(choice,1d),confidence));
        }
        return new DecisionModelGateway.Result("trace","synthetic",answers,1);
    }
    private RecordQualityRequest input() {return new RecordQualityRequest(Map.of("chiefComplaint","合成主诉","presentIllness","未填写时间"));}
    @Test void boundedChoicesReuseLingdtAndObserveTheSameRunWithoutInventingText() {
        when(policy.text(1L,"decision-provider","JEV")).thenReturn("LINGDT");when(policy.secret(1L,"decision-lingdt-api-key",null)).thenReturn("lingdt-key");
        var result=service.assess(30L,input());
        assertThat(result.findings()).extracting(RecordQualityFinding::code).containsExactly("ONSET","ALLERGY_CONFLICT");
        assertThat(result.runId()).isEqualTo(50L);
        verify(gateway).decide(argThat(r->r.questions().size()==10&&!r.state().has("encounterId")&&!r.state().has("residentId")
                &&r.questions().stream().allMatch(q->q.criteria().containsKey("UNKNOWN"))),argThat(s->s.provider()==DecisionProvider.LINGDT&&s.apiKey().equals("lingdt-key")));
        verify(store).bind(eq(c),argThat(b->b.encounterId().equals(30L)&&b.fieldHashes().values().stream().allMatch(h->h.length()==64)));
    }
    @Test void shadowHasObservationButNoActionableFindingsOrFeedbackBinding() {
        when(policy.text(1L,"decision-mode","DISABLED")).thenReturn("SHADOW");
        var r=service.assess(30L,input());assertThat(r.outcome()).isEqualTo("SHADOW");assertThat(r.findings()).isEmpty();verifyNoInteractions(store);
        verify(observations).record(eq(c),eq(DecisionScene.RECORD_QUALITY),eq("SHADOW"),eq("SHADOW"),anyString(),anyString(),anyLong(),eq(true),anyDouble(),anyString(),any(),any(),eq(List.of("ONSET","ALLERGY_CONFLICT")),eq(List.of()),eq("MANUAL_REVIEW"),isNull());
    }
    @Test void lowConfidenceNeverBecomesActionableAndDisabledNeverCallsGateway() {
        doAnswer(a->answer(a.getArgument(0),.5)).when(gateway).decide(any(),any());
        assertThat(service.assess(30L,input()).findings()).isEmpty();
        clearInvocations(gateway);when(policy.text(1L,"decision-mode","DISABLED")).thenReturn("DISABLED");
        assertThat(service.assess(30L,input()).outcome()).isEqualTo("MODE_DISABLED");verifyNoInteractions(gateway);
    }
    @Test void failureOrUnknownChoiceCannotLeakDetailsOrCreateFindings() {
        doThrow(new IllegalStateException("sensitive-key")).when(gateway).decide(any(),any());
        var r=service.assess(30L,input());assertThat(r.outcome()).isEqualTo("FAILED");assertThat(r.findings()).isEmpty();assertThat(r.message()).doesNotContain("sensitive-key");
        doReturn(new DecisionModelGateway.Result("t","m",Map.of("fake",new DecisionModelGateway.ChoiceAnswer("fake",Map.of(),1)),0)).when(gateway).decide(any(),any());
        assertThat(service.assess(30L,input()).findings()).isEmpty();verify(store,never()).bind(any(),any());
    }
    @Test void noAuditOrNoClinicalOwnershipPreventsFeedbackAndAdvice() {
        when(observations.record(any(),any(),anyString(),anyString(),anyString(),anyString(),anyLong(),anyBoolean(),anyDouble(),anyString(),any(),any(),anyList(),anyList(),anyString(),isNull())).thenReturn(null);
        assertThat(service.assess(30L,input()).findings()).isEmpty();verify(store,never()).bind(any(),any());
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"other","c",Set.of("OUTPATIENT_RECEPTION.ACCESS"),10L,11L,"DEPARTMENT",Set.of(),Set.of(),12L));
        assertThatThrownBy(()->service.assess(30L,input())).extracting("code").isEqualTo("RECORD_QUALITY_ENCOUNTER_ACCESS");
    }
    @Test void registrationAccessCannotReadAssessOrFeedbackOnRecordQuality() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"doctor","c",
                Set.of("OUTPATIENT_REGISTRATION.ACCESS"),10L,11L,"DEPARTMENT",Set.of(10L),Set.of(11L),12L));
        assertThatThrownBy(()->service.assess(30L,input())).extracting("code").isEqualTo("RECORD_QUALITY_CONTEXT");
        assertThatThrownBy(()->service.latest(30L)).extracting("code").isEqualTo("RECORD_QUALITY_CONTEXT");
        assertThatThrownBy(()->service.feedback(30L,50L,null)).extracting("code").isEqualTo("RECORD_QUALITY_CONTEXT");
        verifyNoInteractions(encounters,documents,gateway,store);
    }
    @Test void rejectsUnknownFieldsAndSignedDocuments() {
        assertThatThrownBy(()->service.assess(30L,new RecordQualityRequest(Map.of("patientName","x")))).extracting("code").isEqualTo("RECORD_QUALITY_FIELDS_INVALID");
        assertThatThrownBy(()->service.assess(30L,new RecordQualityRequest(Map.of("chiefComplaint","长".repeat(1001))))).extracting("code").isEqualTo("RECORD_QUALITY_FIELDS_INVALID");
        when(documents.findEncounterDocumentAnchor(30L,"OUTPATIENT_NOTE")).thenReturn(Optional.of(new ClinicalDocumentDirectory.EncounterDocumentAnchor(9L,1,"SIGNED")));
        assertThatThrownBy(()->service.assess(30L,input())).extracting("code").isEqualTo("RECORD_QUALITY_SIGNED");verifyNoInteractions(gateway);
    }
}
