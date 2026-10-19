package com.rhn.billing.application;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class ChsExchangeRedactorTest {
    final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void masksCredentialsIdentifiersAndNamesRecursivelyWithoutMutatingInput() {
        var input = mapper.readTree("""
                {"sign_no":"S123","opter":"DOC1","input":{"data":{"mdtrt_cert_no":"360102198801011234","psn_no":"36010012345678",
                "psn_name":"张三丰","certno":"X","cnt":2}},"rows":[{"dr_name":"李四","psn_no":"123"}],"err_msg":"ok"}""");
        var out = ChsExchangeRedactor.redact(input);
        assertThat(out.path("sign_no").asString()).isEqualTo("****");
        assertThat(out.path("opter").asString()).isEqualTo("DOC1");
        assertThat(out.path("input").path("data").path("mdtrt_cert_no").asString()).isEqualTo("****");
        assertThat(out.path("input").path("data").path("psn_no").asString()).isEqualTo("36****78");
        assertThat(out.path("input").path("data").path("psn_name").asString()).isEqualTo("张**");
        assertThat(out.path("input").path("data").path("cnt").asInt()).isEqualTo(2);
        assertThat(out.path("rows").get(0).path("dr_name").asString()).isEqualTo("李*");
        assertThat(out.path("rows").get(0).path("psn_no").asString()).isEqualTo("****");
        assertThat(input.path("sign_no").asString()).isEqualTo("S123");
    }

    @Test
    void nonJsonBodiesOnlyExposeLengthAndMaskedHead() {
        var text = ChsExchangeRedactor.describeRaw("<html>login 360102198801011234</html>");
        assertThat(text).contains("非 JSON").doesNotContain("360102198801011234");
        assertThat(ChsExchangeRedactor.describeRaw("")).contains("空回执");
    }
}
