package com.rhn.platform.search.application;

import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.HanyuPinyinCaseType;
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat;
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType;
import net.sourceforge.pinyin4j.format.HanyuPinyinVCharType;
import net.sourceforge.pinyin4j.format.exception.BadHanyuPinyinOutputFormatCombination;
import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.Locale;

@Component
public class SearchCodeGenerator {
    public static final String VERSION = "search-code-v1";

    private final WubiCodeProvider wubiCodes;
    private final HanyuPinyinOutputFormat pinyinFormat;

    public SearchCodeGenerator(WubiCodeProvider wubiCodes) {
        this.wubiCodes = wubiCodes;
        this.pinyinFormat = new HanyuPinyinOutputFormat();
        this.pinyinFormat.setCaseType(HanyuPinyinCaseType.UPPERCASE);
        this.pinyinFormat.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
        this.pinyinFormat.setVCharType(HanyuPinyinVCharType.WITH_V);
    }

    public GeneratedCodes generate(String value) {
        String name = normalizeName(value);
        return new GeneratedCodes(name, pinyinInitials(name), wubiInitials(name),
                VERSION + "+" + wubiCodes.version());
    }

    public String normalizeQuery(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC).trim().replaceAll("\\s+", " ")
                .toUpperCase(Locale.ROOT);
    }

    private String normalizeName(String value) {
        String normalized = normalizeQuery(value);
        if (normalized.isBlank()) throw new IllegalArgumentException("检索名称不能为空");
        if (normalized.length() > 300) throw new IllegalArgumentException("检索名称不能超过300个字符");
        return normalized;
    }

    private String pinyinInitials(String value) {
        StringBuilder result = new StringBuilder();
        value.codePoints().forEach(codePoint -> {
            if (Character.isLetterOrDigit(codePoint) && codePoint < 128) {
                result.appendCodePoint(Character.toUpperCase(codePoint));
                return;
            }
            if (!isHan(codePoint) || !Character.isBmpCodePoint(codePoint)) return;
            try {
                String[] values = PinyinHelper.toHanyuPinyinStringArray((char) codePoint, pinyinFormat);
                if (values != null && values.length > 0 && !values[0].isEmpty()) result.append(values[0].charAt(0));
            } catch (BadHanyuPinyinOutputFormatCombination exception) {
                throw new IllegalStateException("拼音简码生成器配置错误", exception);
            }
        });
        return limit(result.toString());
    }

    private String wubiInitials(String value) {
        StringBuilder result = new StringBuilder();
        value.codePoints().forEach(codePoint -> {
            if (Character.isLetterOrDigit(codePoint) && codePoint < 128) {
                result.appendCodePoint(Character.toUpperCase(codePoint));
                return;
            }
            if (!isHan(codePoint)) return;
            String code = wubiCodes.codePointCode(codePoint);
            if (code != null && !code.isBlank()) result.append(Character.toUpperCase(code.charAt(0)));
        });
        return limit(result.toString());
    }

    private boolean isHan(int codePoint) {
        return Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HAN;
    }

    private String limit(String value) {
        if (value.isEmpty()) return null;
        return value.length() <= 128 ? value : value.substring(0, 128);
    }

    public record GeneratedCodes(String normalizedName, String pinyin, String wubi, String generatorVersion) {}
}
