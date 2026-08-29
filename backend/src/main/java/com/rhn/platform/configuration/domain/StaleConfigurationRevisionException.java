package com.rhn.platform.configuration.domain;

public final class StaleConfigurationRevisionException extends RuntimeException {
    private final Long currentRevision;

    public StaleConfigurationRevisionException(Long currentRevision) {
        super("参数已被其他操作更新，请刷新后重试");
        this.currentRevision = currentRevision;
    }

    public Long currentRevision() {
        return currentRevision;
    }
}
