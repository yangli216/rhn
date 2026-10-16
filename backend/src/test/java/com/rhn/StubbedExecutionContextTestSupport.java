package com.rhn;

import com.rhn.ai.application.ClinicalAiRuntimePolicy;
import com.rhn.platform.masterdata.application.MedicationRouteService;
import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Service-level tests that stub the caller's {@link ExecutionContextProvider} share one application context, so
 * each fork starts Spring once for all of them. Keep overrides here instead of on subclasses; a class-level
 * difference creates another context. Spies run the real beans unless a test stubs them (use
 * {@code doReturn(..).when(spy)}, which never calls the real method); Mockito resets them after every test.
 */
abstract class StubbedExecutionContextTestSupport extends RhnIntegrationTestSupport {
    @MockitoBean
    protected ExecutionContextProvider contexts;
    @MockitoSpyBean
    protected MedicationRuleAuthoringAi ai;
    @MockitoSpyBean
    protected MedicationRouteService routes;
    @MockitoSpyBean
    protected ClinicalAiRuntimePolicy policy;
}
