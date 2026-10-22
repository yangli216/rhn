package com.rhn.billing.application;

import com.rhn.billing.infrastructure.insurance.chs.ChsModels;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class InsurancePersonAuthByResidentTest {
    private static final String ID = "330102198801011234";

    private InsuranceClaimApplicationService service(NationalInsuranceClient client, Optional<String> nationalId, String insuredName) {
        var residents = mock(ResidentDirectory.class);
        when(residents.requireSnapshot(7L)).thenReturn(new ResidentDirectory.ResidentSnapshot(
                7L, "HR7", "赵医保", "1", LocalDate.of(1988, 1, 1), null, false));
        when(residents.findNationalId(7L)).thenReturn(nationalId);
        when(client.queryPersonInfo(any())).thenReturn(new ChsModels.PersonInfoResponse("PSN1", "01", ID, insuredName, "1",
                LocalDate.of(1988, 1, 1), "310", "职工基本医疗保险", BigDecimal.TEN, "360100", "南昌", "在职", "NORMAL"));
        var service = new InsuranceClaimApplicationService(mock(InsuranceClaimTransactionService.class), List.of(),
                mock(ExternalMessageService.class), mock(ExecutionContextProvider.class), client);
        service.setResidents(residents);
        return service;
    }

    @Test void authenticatesWithArchiveIdentityWithoutBrowserInput() {
        var client = mock(NationalInsuranceClient.class);
        var view = service(client, Optional.of(ID), "赵医保").queryPersonInfoByResident(7L);
        assertEquals("NORMAL", view.status());
        verify(client).queryPersonInfo(new ChsModels.PersonInfoRequest("01", ID, "赵医保"));
    }

    @Test void rejectsWhenInsuredNameDiffersFromArchive() {
        var ex = assertThrows(BusinessException.class,
                () -> service(mock(NationalInsuranceClient.class), Optional.of(ID), "钱医保").queryPersonInfoByResident(7L));
        assertEquals("INSURANCE_PERSON_NAME_MISMATCH", ex.code());
    }

    @Test void rejectsWhenReturnedPersonNoDiffersFromCoverage() {
        var service = service(mock(NationalInsuranceClient.class), Optional.of(ID), "赵医保");
        var coverages = mock(CoverageDirectory.class);
        when(coverages.findActiveMemberNos(7L, null)).thenReturn(List.of("PSN-OTHER"));
        service.setCoverages(coverages);
        var ex = assertThrows(BusinessException.class, () -> service.queryPersonInfoByResident(7L));
        assertEquals("INSURANCE_PERSON_NO_MISMATCH", ex.code());
        assertTrue(ex.getMessage().contains("PSN1") && ex.getMessage().contains("PSN-OTHER"));
        assertFalse(ex.getMessage().contains("凭证已失效"));

        when(coverages.findActiveMemberNos(7L, null)).thenReturn(List.of("PSN-OTHER", "PSN1"));
        assertEquals("PSN1", service.queryPersonInfoByResident(7L).personNo());
        // 保障信息未登记个人编号时不在此处拦截，由预结算给出“未登记医保个人编号”的提示
        when(coverages.findActiveMemberNos(7L, null)).thenReturn(List.of());
        assertEquals("PSN1", service.queryPersonInfoByResident(7L).personNo());
    }

    @Test void rejectsWhenArchiveHasNoNationalId() {
        var client = mock(NationalInsuranceClient.class);
        var ex = assertThrows(BusinessException.class, () -> service(client, Optional.empty(), "赵医保").queryPersonInfoByResident(7L));
        assertEquals("RESIDENT_NATIONAL_ID_MISSING", ex.code());
        verify(client, never()).queryPersonInfo(any());
    }
}
