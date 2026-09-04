package com.rhn.shared.api;

/** 聚合根修订号过期的统一异常，替代各模块私有的 Stale*RevisionException。 */
public class StaleRevisionException extends RuntimeException {
    private final Long currentRevision;

    public StaleRevisionException(Long currentRevision) {
        this(currentRevision, "数据已被其他操作更新，请刷新后重试");
    }

    public StaleRevisionException(Long currentRevision, String message) {
        super(message);
        this.currentRevision = currentRevision;
    }

    public Long currentRevision() {
        return currentRevision;
    }
}
