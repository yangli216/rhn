package com.rhn.platform.search.api;

public record SearchPreference(
        SearchInputMode inputMode,
        SearchMatchMode matchMode,
        double similarityThreshold,
        int resultLimit
) {
    public static final SearchPreference DEFAULT = new SearchPreference(
            SearchInputMode.PINYIN, SearchMatchMode.PREFIX, 0.75, 30);

    public SearchPreference {
        inputMode = inputMode == null ? SearchInputMode.PINYIN : inputMode;
        matchMode = matchMode == null ? SearchMatchMode.PREFIX : matchMode;
        if (similarityThreshold < 0.5 || similarityThreshold > 1) {
            throw new IllegalArgumentException("检索相似度阈值必须在0.5到1之间");
        }
        if (resultLimit < 10 || resultLimit > 100) {
            throw new IllegalArgumentException("检索结果数必须在10到100之间");
        }
    }
}
