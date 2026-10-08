package com.rhn.platform.web;

import com.rhn.shared.api.StaleRevisionException;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import jakarta.validation.constraints.Min;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();
    private final MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/api/resources/1");

    @Test
    void mvcConstraintTypeAndMissingParameterErrorsReturnFieldViolations() throws Exception {
        var validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        try {
            var mvc = MockMvcBuilders.standaloneSetup(new ValidationController())
                    .setControllerAdvice(handler).setValidator(validator).build();
            for (var query : new String[]{"8", "invalid"}) {
                mvc.perform(get("/validation/parameters").param("size", query))
                        .andExpect(status().isBadRequest())
                        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                        .andExpect(jsonPath("$.violations[0].field").value("size"));
            }
            mvc.perform(get("/validation/parameters"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.violations[0].field").value("size"));
            mvc.perform(get("/validation/parameters").param("size", "10"))
                    .andExpect(status().isOk()).andExpect(content().string("10"));
            mvc.perform(get("/validation/invalid-output"))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                    .andExpect(jsonPath("$.violations.length()").value(0));
        } finally {
            validator.close();
        }
    }

    @RestController
    static class ValidationController {
        @GetMapping("/validation/parameters")
        public int parameters(@RequestParam("size") @Min(10) int requestedSize) { return requestedSize; }

        @GetMapping("/validation/invalid-output")
        @Min(10)
        public int invalidOutput() { return 1; }
    }

    @Test
    void mapsUnwrappedStaleRevisionToConflict() {
        var response = handler.handleStaleRevision(
                new StaleRevisionException(3L, "数据已更新"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("REVISION_CONFLICT");
        assertThat(response.getBody().message()).isEqualTo("数据已更新");
    }

    @Test
    void mapsDomainStateFailureToConflictDuringMigration() {
        var response = handler.handleIllegalState(new IllegalStateException("NOT_ADMITTED"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("STATE_CONFLICT");
        assertThat(response.getBody().message()).isEqualTo("NOT_ADMITTED");
    }
}
