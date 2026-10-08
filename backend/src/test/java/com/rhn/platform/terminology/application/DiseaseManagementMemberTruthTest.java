package com.rhn.platform.terminology.application;

import com.rhn.platform.terminology.domain.*;
import com.rhn.platform.terminology.infrastructure.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class DiseaseManagementMemberTruthTest {
    @ParameterizedTest @ValueSource(strings = {"missing-concept", "missing-system", "unknown-domain", "tcm"})
    void memberViewsNeverInventADomainOrClaimDeletion(String scenario) {
        var systems = mock(CodeSystemRepository.class);
        var concepts = mock(ConceptRepository.class);
        var programs = mock(DiseaseManagementProgramRepository.class);
        var members = mock(DiseaseManagementMemberRepository.class);
        var rules = mock(DiseaseManagementRuleRepository.class);
        var service = new TerminologyApplicationService(systems, concepts, mock(ConceptAliasRepository.class),
                mock(ValueSetRepository.class), mock(ValueSetMemberRepository.class), programs, members, rules,
                mock(com.rhn.platform.search.api.MasterDataSearchDirectory.class),
                mock(com.rhn.platform.search.application.SearchEntryProjectionService.class));
        var program = mock(DiseaseManagementProgram.class);
        when(program.id()).thenReturn(1L);
        when(program.scopeType()).thenReturn(TerminologyScope.TENANT);
        when(program.status()).thenReturn(TerminologyStatus.ACTIVE);
        when(programs.searchVisible(anyLong(), anyString(), any(), any(), any())).thenReturn(new PageImpl<>(List.of(program)));
        var member = mock(DiseaseManagementMember.class);
        when(member.programId()).thenReturn(1L);
        when(member.conceptId()).thenReturn(2L);
        when(member.inclusionMode()).thenReturn("INCLUDE");
        when(members.findByProgramIdIn(any())).thenReturn(List.of(member));
        when(rules.findByProgramIdIn(any())).thenReturn(List.of());
        var concept = mock(Concept.class);
        when(concept.id()).thenReturn(2L);
        when(concept.codeSystemId()).thenReturn(3L);
        when(concept.code()).thenReturn("XK_BING");
        when(concept.display()).thenReturn("消渴病");
        when(concepts.findAllById(any())).thenReturn(scenario.equals("missing-concept") ? List.of() : List.of(concept));
        var system = mock(CodeSystem.class);
        when(system.id()).thenReturn(3L);
        when(system.name()).thenReturn("真实编码体系");
        when(system.diagnosisDomain()).thenReturn(scenario.equals("tcm") ? "TCM_DISEASE" : null);
        when(systems.findAllById(any())).thenReturn(scenario.startsWith("missing-") ? List.of() : List.of(system));

        var result = service.searchDiseaseManagementPrograms(1L, "", null, null, 0, 20).content().getFirst().members().getFirst();
        assertEquals(2L, result.conceptId());
        assertEquals(scenario.equals("tcm") ? "TCM_DISEASE" : null, result.sdDiagnosisDomain());
        if (scenario.equals("missing-concept")) {
            assertNull(result.code());
            assertEquals("概念信息待确认", result.display());
        } else {
            assertEquals("XK_BING", result.code());
            assertEquals("消渴病", result.display());
        }
        assertFalse(result.display().contains("已删除"));
    }
}
