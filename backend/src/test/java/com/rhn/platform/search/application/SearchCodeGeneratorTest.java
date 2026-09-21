package com.rhn.platform.search.application;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SearchCodeGeneratorTest {
    private final SearchCodeGenerator generator = new SearchCodeGenerator(new WubiCodeProvider() {
        private final Map<Integer, String> values = Map.of(
                (int) '黄', "amw", (int) '芪', "aqab", (int) '对', "cf", (int) '乙', "nnll");

        @Override public String codePointCode(int codePoint) { return values.get(codePoint); }
        @Override public String version() { return "test-wubi"; }
    });

    @Test
    void generatesDeterministicPinyinAndWubiInitials() {
        var codes = generator.generate(" 黄芪 ");

        assertThat(codes.normalizedName()).isEqualTo("黄芪");
        assertThat(codes.pinyin()).isEqualTo("HQ");
        assertThat(codes.wubi()).isEqualTo("AA");
        assertThat(codes.generatorVersion()).isEqualTo("search-code-v1+test-wubi");
    }

    @Test
    void preservesAsciiAndNormalizesFullWidthCharacters() {
        var codes = generator.generate("Ａ-对乙 01");

        assertThat(codes.normalizedName()).isEqualTo("A-对乙 01");
        assertThat(codes.pinyin()).isEqualTo("ADY01");
        assertThat(codes.wubi()).isEqualTo("ACN01");
    }
}
