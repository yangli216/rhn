package com.rhn.platform.masterdata.domain;

public enum MasterDataImportBatchStatus {
    PREFLIGHTING,
    READY,
    INVALID,
    IMPORTING,
    COMPLETED,
    PARTIAL,
    CANCELLED
}
