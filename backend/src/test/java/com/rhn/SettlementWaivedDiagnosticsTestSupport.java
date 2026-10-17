package com.rhn;

import com.rhn.diagnostics.application.DiagnosticSigningPolicy;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

/**
 * Diagnostics flows without the settlement gate share one application context, so each fork starts Spring once
 * for all of them. Keep overrides here instead of on subclasses; a class-level difference creates another context.
 * Spies run the real beans unless a test stubs them (use {@code doReturn(..).when(spy)}); Mockito resets them
 * after every test.
 */
@TestPropertySource(properties = {"rhn.diagnostics.require-settlement-authorization=false",
        "rhn.diagnostics.critical-value.acknowledgement-window=PT7M"})
abstract class SettlementWaivedDiagnosticsTestSupport extends RhnIntegrationTestSupport {
    @MockitoSpyBean
    protected DiagnosticSigningPolicy signing;
    @MockitoSpyBean
    protected WorkContextDirectory workContexts;
}
