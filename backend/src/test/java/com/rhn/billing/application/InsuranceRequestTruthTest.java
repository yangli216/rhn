package com.rhn.billing.application;

import com.rhn.billing.application.InsuranceClaimTransactionService.CreateCommand;
import com.rhn.billing.application.InsuranceClaimTransactionService.LineMapping;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceRequestTruthTest {
    final InsuranceClaimRepository claims = mock(InsuranceClaimRepository.class);
    final InsuranceClaimLineRepository lines = mock(InsuranceClaimLineRepository.class);
    final InsuranceClaimResponseRepository responses = mock(InsuranceClaimResponseRepository.class);
    final SettlementRepository settlements = mock(SettlementRepository.class);
    final SettlementLineRepository settlementLines = mock(SettlementLineRepository.class);
    final ChargeItemRepository charges = mock(ChargeItemRepository.class);
    final PatientAccountRepository accounts = mock(PatientAccountRepository.class);
    final CoverageDirectory coverages = mock(CoverageDirectory.class);
    final InsuranceQuickSubmissionResolver resolver = mock(InsuranceQuickSubmissionResolver.class);
    final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    final JsonCodec json = mock(JsonCodec.class);
    final PatientAccount account = mock(PatientAccount.class);
    final Instant started = Instant.parse("2026-10-03T23:30:00Z");
    final Instant ended = started.plusSeconds(1800);
    final InsuranceClaim claim = new InsuranceClaim(1L,2L,3L,4L,"KEY","REGION","BASIC","payer",
            "H","D","P","HASH",started,ended,new BigDecimal("100"),"CNY","original-correlation",5L);
    InsuranceClaimTransactionService service;

    @BeforeEach void setup() {
        service = new InsuranceClaimTransactionService(claims,lines,responses,settlements,settlementLines,charges,
                accounts,coverages,mock(SettlementApplicationService.class),contexts,json,resolver,mock(ItemStandardMappingDirectory.class),mock(com.rhn.platform.integration.api.ExternalMessageService.class));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L,5L,"cashier","corr",Set.of(),6L,7L,"SELF",Set.of(),Set.of()));
        when(claims.findByTenantIdAndCommandCode(1L,"KEY")).thenReturn(Optional.of(claim));
        when(accounts.findByIdAndTenantId(3L,1L)).thenReturn(Optional.of(account));
        when(account.organizationId()).thenReturn(6L);
        when(account.residentId()).thenReturn(8L);
        when(lines.findByTenantIdAndClaimIdOrderByLineNoAsc(1L,claim.id())).thenReturn(List.of(
                line(10L,"INS-A","{\"mappingId\":\"1\",\"system\":\"CHS\"}"), line(11L,"INS-B","{}")));
        when(json.readObject(anyString())).thenAnswer(call -> JsonMapper.builder().build().readValue((String)call.getArgument(0),LinkedHashMap.class));
    }
    InsuranceClaimLine line(Long id,String code,String trace) {
        return new InsuranceClaimLine(1L,claim.id(),id,1,"LOCAL",code,"Item","TREATMENT",
                BigDecimal.ONE,new BigDecimal("50"),new BigDecimal("50"),trace);
    }
    List<LineMapping> originalLines() {
        return List.of(new LineMapping(10L,"INS-A",Map.of("mappingId","1","system","CHS")),new LineMapping(11L,"INS-B",null));
    }
    CreateCommand command(Map<String,Object> changes) {
        var p = new HashMap<String,Object>();
        p.put("settlement",2L); p.put("coverage",4L); p.put("region","REGION"); p.put("type","BASIC");
        p.put("org","H"); p.put("dept","D"); p.put("doctor","P"); p.put("diagnosis","HASH");
        p.put("start",started); p.put("end",ended); p.putAll(changes);
        return new CreateCommand((Long)p.get("settlement"),(Long)p.get("coverage"),"KEY",(String)p.get("region"),(String)p.get("type"),
                (String)p.get("org"),(String)p.get("dept"),(String)p.get("doctor"),(String)p.get("diagnosis"),
                (Instant)p.get("start"),(Instant)p.get("end"),"new-transport-correlation",originalLines());
    }
    CreateCommand withLines(List<LineMapping> values) {
        var c=command(Map.of());
        return new CreateCommand(c.settlementId(),c.coverageId(),c.idempotencyKey(),c.regionCode(),c.insuranceTypeCode(),
                c.organizationCode(),c.departmentCode(),c.practitionerCode(),c.diagnosisPayloadDigest(),c.serviceStartedAt(),c.serviceEndedAt(),c.correlationId(),values);
    }
    void mismatch(CreateCommand command) {
        assertEquals("INSURANCE_IDEMPOTENCY_MISMATCH",assertThrows(BusinessException.class,()->service.create(command)).code());
        verify(claims,never()).save(any()); verify(lines,never()).save(any());
        verifyNoInteractions(responses,settlements,charges,settlementLines,coverages);
    }
    @ParameterizedTest @ValueSource(strings={"settlement","coverage","region","type","org","dept","doctor","diagnosis","start","end"})
    void changedBusinessFieldsCannotReplayAnOldClaim(String field) {
        Object changed=switch(field) { case "settlement","coverage" -> 99L; case "start","end" -> started.plusSeconds(60); default -> "OTHER"; };
        mismatch(command(Map.of(field,changed)));
    }
    @Test void missingTimeCannotReplayAnOldClaim() {
        var changes=new HashMap<String,Object>(); changes.put("start",null); mismatch(command(changes));
    }
    @Test void identicalRetryUsesStoredSnapshotWithoutRevalidatingCurrentDirectories() {
        var result=service.create(command(Map.of("region"," region ","type"," basic ","org"," H ","diagnosis"," HASH ")));
        assertTrue(result.duplicate()); assertSame(claim,result.claim());
        verifyNoInteractions(resolver,coverages,settlements,charges,settlementLines,responses);
        verify(claims,never()).save(any()); verify(lines,never()).save(any());
    }
    @Test void orderingAndOptionalEmptyTraceDoNotChangeRequestMeaning() {
        assertTrue(service.create(withLines(List.of(new LineMapping(11L,"INS-B",Map.of()),
                new LineMapping(10L," INS-A ",Map.of("system","CHS","mappingId","1"))))).duplicate());
    }
    @Test void missingAdditionalDuplicateAndSubstitutedLinesAreRejected() {
        var original=originalLines();
        mismatch(withLines(null)); mismatch(withLines(List.of())); mismatch(withLines(List.of(original.getFirst())));
        mismatch(withLines(List.of(original.getFirst(),original.getFirst())));
        mismatch(withLines(List.of(original.getFirst(),new LineMapping(99L,"INS-B",null))));
        mismatch(withLines(List.of(original.getFirst(),original.getLast(),new LineMapping(99L,"INS-C",null))));
    }
    @Test void changedCodeOrTraceCannotReplay() {
        for(var changed:List.of(new LineMapping(10L,"OTHER",Map.of("mappingId","1","system","CHS")),
                new LineMapping(10L,"INS-A",Map.of("mappingId","2","system","CHS")), new LineMapping(10L,"INS-A",null))) {
            mismatch(withLines(List.of(changed,originalLines().getLast())));
        }
    }
    @Test void retryStillRequiresAccessToOriginalOrganization() {
        when(account.organizationId()).thenReturn(99L);
        assertEquals("INSURANCE_CLAIM_FORBIDDEN",assertThrows(BusinessException.class,()->service.create(command(Map.of()))).code());
        verifyNoInteractions(lines,json,coverages,settlements);
    }
    @Test void newSubmissionCannotInventStartTimeOrAcceptBackwardsPeriod() {
        when(claims.findByTenantIdAndCommandCode(1L,"KEY")).thenReturn(Optional.empty());
        var absent=new HashMap<String,Object>(); absent.put("start",null);
        assertEquals("INSURANCE_SERVICE_TIME_REQUIRED",assertThrows(BusinessException.class,()->service.create(command(absent))).code());
        assertEquals("INSURANCE_SERVICE_TIME_INVALID",assertThrows(BusinessException.class,
                ()->service.create(command(Map.of("end",started.minusSeconds(1))))).code());
        verifyNoInteractions(settlements,coverages,lines,charges);
    }
    @Test void newSubmissionChecksCoverageUsingOrganizationServiceDate() {
        when(claims.findByTenantIdAndCommandCode(1L,"KEY")).thenReturn(Optional.empty());
        var settlement=mock(Settlement.class); when(settlement.status()).thenReturn(SettlementStatus.PRICED);
        when(settlement.patientAccountId()).thenReturn(3L);
        when(settlements.findByIdAndTenantId(2L,1L)).thenReturn(Optional.of(settlement));
        LocalDate date=LocalDate.of(2026,10,4);
        when(resolver.serviceDate(account,started)).thenReturn(date);
        when(coverages.requireActive(4L,8L,date)).thenThrow(com.rhn.shared.api.BusinessErrors.conflict("COVERAGE_EXPIRED","expired"));
        assertEquals("COVERAGE_EXPIRED",assertThrows(BusinessException.class,()->service.create(command(Map.of()))).code());
        verify(resolver).serviceDate(account,started); verify(coverages).requireActive(4L,8L,date);
        verify(claims,never()).save(any()); verifyNoInteractions(charges,settlementLines);
    }
}
