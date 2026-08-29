package com.rhn.platform.terminology.domain;

import java.util.Set;
import java.util.regex.Pattern;

public final class TerminologyCodePolicy {
    private static final String SEGMENT = "[A-Z][A-Z0-9_]*";
    private static final String DOMAIN = "(?:COMMON|SYS|BD|META|PI|SC|VIS|EX|HPL|BIL|INS|SUP|INT|AUD)";

    public static final String CODE_SYSTEM_REGEX =
            "^(?=.{1,100}$)" + SEGMENT + "\\." + DOMAIN + "\\.CS\\." + SEGMENT
                    + "(?:\\." + SEGMENT + ")?$";
    public static final String VALUE_SET_REGEX =
            "^(?=.{1,100}$)" + SEGMENT + "\\." + DOMAIN + "\\.VS\\." + SEGMENT
                    + "(?:\\." + SEGMENT + ")?$";
    public static final String RHN_CONCEPT_REGEX = "^[A-Z][A-Z0-9_]{0,63}$";

    private static final Pattern CODE_SYSTEM_PATTERN = Pattern.compile(CODE_SYSTEM_REGEX);
    private static final Pattern VALUE_SET_PATTERN = Pattern.compile(VALUE_SET_REGEX);
    private static final Pattern RHN_CONCEPT_PATTERN = Pattern.compile(RHN_CONCEPT_REGEX);
    private static final Pattern CALENDAR_VERSION_PATTERN =
            Pattern.compile("^(?:19|20)[0-9]{2}\\.(?:0[1-9]|1[0-2])(?:\\.[1-9][0-9]*)?$");
    private static final Pattern VERSION_SUFFIX_PATTERN =
            Pattern.compile("(?:^|.*_)(?:V[0-9]+|(?:19|20)[0-9]{2}(?:_[0-9]{1,2})?)$");
    private static final Set<String> AMBIGUOUS_SUBJECTS = Set.of("STATUS", "TYPE", "CATEGORY", "KIND");

    private TerminologyCodePolicy() {
    }

    public static String requireCodeSystemCode(String code, TerminologyScope scope) {
        String validated = requireResourceCode(code, "编码体系", CODE_SYSTEM_PATTERN);
        requireUnambiguousAndVersionless(validated);
        requireCodeSystemScope(validated, scope);
        return validated;
    }

    public static String requireValueSetCode(String code, TerminologyScope scope) {
        String validated = requireResourceCode(code, "值域", VALUE_SET_PATTERN);
        requireUnambiguousAndVersionless(validated);
        requireValueSetScope(validated, scope);
        return validated;
    }

    public static String requireVersion(String resourceCode, String version) {
        if (version == null || version.isBlank() || version.length() > 64) {
            throw new IllegalArgumentException("术语版本不能为空且不能超过 64 个字符");
        }
        String owner = ownerOf(resourceCode);
        if (("RHN".equals(owner) || "LOCAL".equals(owner))
                && !CALENDAR_VERSION_PATTERN.matcher(version).matches()) {
            throw new IllegalArgumentException("RHN 和 LOCAL 术语版本必须使用 YYYY.MM 或 YYYY.MM.N");
        }
        return version;
    }

    public static String requireConceptCode(String codeSystemCode, String conceptCode) {
        if (conceptCode == null || conceptCode.isBlank() || conceptCode.length() > 100) {
            throw new IllegalArgumentException("概念代码不能为空且不能超过 100 个字符");
        }
        if ("RHN".equals(ownerOf(codeSystemCode)) && !RHN_CONCEPT_PATTERN.matcher(conceptCode).matches()) {
            throw new IllegalArgumentException("RHN 概念代码必须使用大写字母、数字或下划线，且不能超过 64 个字符");
        }
        return conceptCode;
    }

    public static boolean isRhnOwned(String resourceCode) {
        return "RHN".equals(ownerOf(resourceCode));
    }

    private static String requireResourceCode(String code, String label, Pattern pattern) {
        if (code == null || !pattern.matcher(code).matches()) {
            throw new IllegalArgumentException(label
                    + "登记键必须使用 OWNER.DOMAIN.KIND.SUBJECT[.ATTRIBUTE] 格式、全大写且不超过 100 个字符");
        }
        return code;
    }

    private static void requireUnambiguousAndVersionless(String code) {
        String[] segments = code.split("\\.");
        if (segments.length == 4 && AMBIGUOUS_SUBJECTS.contains(segments[3])) {
            throw new IllegalArgumentException("术语主题不能只使用 STATUS、TYPE、CATEGORY 或 KIND，必须包含业务对象");
        }
        for (int index = 3; index < segments.length; index++) {
            if (VERSION_SUFFIX_PATTERN.matcher(segments[index]).matches()) {
                throw new IllegalArgumentException("术语登记键不能包含版本号，版本必须使用 versionCode");
            }
        }
    }

    private static void requireCodeSystemScope(String code, TerminologyScope scope) {
        String owner = ownerOf(code);
        if (scope == TerminologyScope.PRODUCT && "LOCAL".equals(owner)) {
            throw new IllegalArgumentException("LOCAL 编码体系只能使用租户作用域");
        }
        if (scope == TerminologyScope.TENANT && !"LOCAL".equals(owner)) {
            throw new IllegalArgumentException("租户编码体系必须使用 LOCAL OWNER，本地代码应通过 Mapping 关联标准概念");
        }
    }

    private static void requireValueSetScope(String code, TerminologyScope scope) {
        String owner = ownerOf(code);
        if (scope == TerminologyScope.PRODUCT && "LOCAL".equals(owner)) {
            throw new IllegalArgumentException("LOCAL 值域只能使用租户作用域");
        }
        if (scope == TerminologyScope.TENANT && !("LOCAL".equals(owner) || "RHN".equals(owner))) {
            throw new IllegalArgumentException("租户值域只能使用 LOCAL OWNER，或使用同名 RHN 值域覆盖产品值域");
        }
    }

    private static String ownerOf(String code) {
        int separator = code.indexOf('.');
        return separator < 0 ? code : code.substring(0, separator);
    }
}
