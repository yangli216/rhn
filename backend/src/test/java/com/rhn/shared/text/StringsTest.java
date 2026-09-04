package com.rhn.shared.text;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StringsTest {
    @Test
    void normalizesRequiredAndOptionalText() {
        assertThat(Strings.requireText("  参数名称  ", "参数名称", 20)).isEqualTo("参数名称");
        assertThat(Strings.optionalText("  备注  ", 20)).isEqualTo("备注");
        assertThat(Strings.optionalText("   ", 20)).isNull();
    }

    @Test
    void rejectsInvalidIdentifiersAndOversizedText() {
        assertThatThrownBy(() -> Strings.requireId(0L, "操作用户"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("操作用户标识不能为空");
        assertThatThrownBy(() -> Strings.requireText("1234", "参数名称", 3))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("参数名称长度不能超过3");
    }
}
