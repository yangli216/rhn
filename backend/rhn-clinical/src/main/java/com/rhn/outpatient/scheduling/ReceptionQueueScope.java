package com.rhn.outpatient.scheduling;

import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;

enum ReceptionQueueScope {
    PERSONAL,
    DEPARTMENT,
    ORGANIZATION,
    REGISTERED_BY_ME;

    static ReceptionQueueScope parse(String value) {
        if (value == null || value.isBlank()) return DEPARTMENT;
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw badRequest("RECEPTION_QUEUE_SCOPE_INVALID", "数据视角仅支持本人待诊、本科室、本院或本人挂号");
        }
    }
}
