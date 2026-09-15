package com.rhn.platform.idempotency;

public record IdempotencyReservation(
        boolean acquired,
        boolean replay,
        String resourceType,
        Long resourceId,
        Integer responseStatus,
        String responseJson
) {
}
