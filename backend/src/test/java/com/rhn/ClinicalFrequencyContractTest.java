package com.rhn;

import com.rhn.platform.masterdata.api.ClinicalFrequencySemantics;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Plain unit test: the same fixtures are consumed by the frontend, without Spring or a database. */
class ClinicalFrequencyContractTest {
    @Test
    void matches_shared_frontend_contract_cases() throws Exception {
        try (var input = getClass().getResourceAsStream("/contracts/clinical-frequency-semantics.json")) {
            assertThat(input).isNotNull();
            for (var fixture : new ObjectMapper().readTree(input)) {
                var snapshot = fixture.path("snapshot");
                var expected = fixture.path("expected");
                var actual = ClinicalFrequencySemantics.interpret(snapshot.isNull() ? null : frequency(snapshot));
                var id = fixture.path("id").asString();
                assertThat(actual.kind()).as(id).isEqualTo(expected.path("kind").asString());
                assertThat(actual.dailyRateComputable()).as(id).isEqualTo(expected.path("dailyRateComputable").asBoolean());
                assertThat(actual.unknownReason()).as(id).isEqualTo(text(expected, "unknownReason"));
                assertThat(actual.scheduledTimes()).as(id).isEqualTo(strings(expected.path("scheduledTimes")));
                if (actual.dailyRateComputable()) {
                    assertThat(actual.doses()).as(id).isEqualByComparingTo(decimal(expected, "doses"));
                    assertThat(actual.perDays()).as(id).isEqualByComparingTo(decimal(expected, "perDays"));
                } else {
                    assertThat(actual.doses()).as(id).isNull();
                    assertThat(actual.perDays()).as(id).isNull();
                }
            }
        }
    }

    private FrequencySnapshot frequency(JsonNode value) {
        return new FrequencySnapshot(1L, 0, text(value, "code"), text(value, "name"), null, null,
                text(value, "ruleType"), value.path("frequencyCount").isNull() ? null : value.path("frequencyCount").asInt(),
                decimal(value, "periodValue"), text(value, "periodUnit"), "STANDARD_TIME",
                strings(value.path("executionTimes")), "REMAINING_SLOTS", true);
    }

    private String text(JsonNode value, String field) {
        return value.path(field).isNull() ? null : value.path(field).asString();
    }

    private BigDecimal decimal(JsonNode value, String field) {
        return value.path(field).isNull() ? null : new BigDecimal(value.path(field).asString());
    }

    private List<String> strings(JsonNode values) {
        var result = new ArrayList<String>();
        values.forEach(value -> result.add(value.asString()));
        return result;
    }
}
