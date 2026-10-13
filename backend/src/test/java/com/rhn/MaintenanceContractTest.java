package com.rhn;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MaintenanceContractTest extends RhnIntegrationTestSupport {
    @Test void maintenance_contracts_are_named_separately_and_export_the_actual_api() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var document = json(body);
        assertThat(document.at("/components/schemas/MaintenancePreviewRequest").isMissingNode()).isFalse();
        assertThat(document.at("/components/schemas/MaintenanceBatchView").isMissingNode()).isFalse();
        assertThat(document.at("/paths/~1api~1platform~1maintenance~1tasks~1{id}~1backup/get").isMissingNode()).isFalse();
        String export = System.getProperty("rhn.maintenance.openapi-export");
        if (export != null) {
            Path target = Path.of(export).toAbsolutePath(); Files.createDirectories(target.getParent()); Files.writeString(target,body);
        }
    }
}
