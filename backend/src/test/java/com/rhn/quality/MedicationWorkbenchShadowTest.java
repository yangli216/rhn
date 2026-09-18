package com.rhn.quality;

import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.application.MedicationWorkbenchService;
import com.rhn.quality.medication.infrastructure.MedicationWorkbenchStore;
import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshotDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import java.math.BigDecimal;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class MedicationWorkbenchShadowTest {
    @Test void shadow_uses_saved_his_facts_without_current_master_data_or_ai() {
        var ai=mock(MedicationRuleAuthoringAi.class);var knowledge=mock(MedicationKnowledgeDirectory.class);
        var directory=mock(PrescriptionSafetySnapshotDirectory.class);var contexts=mock(ExecutionContextProvider.class);
        var store=mock(MedicationWorkbenchStore.class);var json=mock(JsonCodec.class);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"doctor","test",Set.of("MASTER_DATA.MANAGE")));
        var current=medication(7);var saved=medication(3);
        var facts=new MedicationKnowledgeDirectory.Knowledge(current,2,"LEGACY",Instant.now(),List.of(),List.of(),List.of());
        var candidate=new Candidate(10L,null,1,"按 HIS 上限检查","制度","model",Instant.now(),
                new RuleSpec("ANTIMICROBIAL_MAX_DAYS","疗程","HIS 上限",2,"请核对","WARN"),List.of(facts),"CANDIDATE");
        when(store.require(1L,10L)).thenReturn(candidate);
        var row=new PrescriptionSafetySnapshot.MedicationItem(11L,0,90L,101L,null,"DRAFT","LEGACY",
                BigDecimal.ONE,"mg",1L,"ORAL","ORAL","RESOLVED",1L,"QD","{}",new BigDecimal("5"),"DAY","historical","{}","{}");
        var snapshot=new PrescriptionSafetySnapshot(PrescriptionSafetySnapshot.SCHEMA_VERSION,1L,20L,0,30L,40L,50L,60L,"DRAFT",List.of(row));
        when(directory.requireSnapshot(30L,20L)).thenReturn(snapshot);
        when(json.read("historical",MedicationSnapshot.class)).thenReturn(saved);
        when(json.write(any())).thenReturn("serialized historical prescription");
        var service=new MedicationWorkbenchService(ai,knowledge,directory,contexts,store,json);
        var preview=service.prescriptionPreview(new ShadowRequest(30L,20L));
        assertEquals(20L,preview.prescriptionId());
        assertEquals(1,preview.items().size());
        assertEquals("历史药品",preview.items().getFirst().medicationName());
        assertEquals(new BigDecimal("5"),preview.items().getFirst().durationDays());
        var run=service.shadow(10L,new ShadowRequest(30L,20L));
        assertEquals("HIS_SHADOW",run.mode());assertEquals("WARN",run.cases().getFirst().actual());
        assertTrue(run.cases().getFirst().reasons().getFirst().contains("3 天"));
        verifyNoInteractions(ai,knowledge);verify(store).appendRun(eq(1L),eq(2L),eq(run),eq("serialized historical prescription"));
        when(json.read("historical",MedicationSnapshot.class)).thenThrow(new IllegalArgumentException("legacy"));
        assertEquals("UNAVAILABLE",service.shadow(10L,new ShadowRequest(30L,20L)).cases().getFirst().actual());
    }
    private MedicationSnapshot medication(int limit) {
        var value=mock(MedicationSnapshot.class);when(value.id()).thenReturn(90L);when(value.name()).thenReturn("历史药品");
        when(value.antimicrobial()).thenReturn(true);when(value.antimicrobialMaxDays()).thenReturn(limit);return value;
    }
}
