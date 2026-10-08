package com.rhn.billing.application;

import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InsuranceQuickCommandTest {
    @Test void requiresCallerCommandInsteadOfGeneratingADifferentOneForEveryRetry() {
        var transactions=mock(InsuranceClaimTransactionService.class);
        var context=mock(ExecutionContextProvider.class);
        when(context.requireCurrent()).thenReturn(new ExecutionContext(1L,2L,"cashier","corr",Set.of()));
        var service=new InsuranceClaimApplicationService(transactions,List.of(),mock(ExternalMessageService.class),context,mock(NationalInsuranceClient.class));
        for(String command:new String[]{null," ","x".repeat(129)}) {
            assertEquals("INSURANCE_COMMAND_REQUIRED",assertThrows(BusinessException.class,
                    ()->service.quickPreSettle(3L,null,null,null,command)).code());
        }
        verifyNoInteractions(transactions);
    }
}
