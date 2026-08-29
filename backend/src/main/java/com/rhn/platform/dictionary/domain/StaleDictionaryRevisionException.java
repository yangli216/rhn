package com.rhn.platform.dictionary.domain;

public final class StaleDictionaryRevisionException extends RuntimeException {
    private final Long currentRevision;

    public StaleDictionaryRevisionException(Long currentRevision) {
        super("字典已被其他操作更新，请刷新后重试");
        this.currentRevision = currentRevision;
    }

    public Long currentRevision() {
        return currentRevision;
    }
}

