package com.rhn.billing.domain;

/** 政策版本状态；发布后内容不可修改，新版本发布时旧版本被替代。 */
public enum ReliefVersionStatus {
    DRAFT,
    PUBLISHED,
    SUPERSEDED
}
