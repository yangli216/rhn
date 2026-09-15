package com.rhn.platform.web;

import com.rhn.shared.api.StaleRevisionException;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();
    private final MockHttpServletRequest request = new MockHttpServletRequest("PUT", "/api/resources/1");

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
