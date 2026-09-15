package com.rhn.platform.organization.api;

public record PositionView(
        Long id, long revision, String code, String name,
        String sdPositionType, String dutyDescription, String sdPersonnelStatus
) {
}
