package com.rhn.platform.organization.api;

/** A practitioner currently holding an active assignment on a position of the requested type. */
public record PositionStaffRef(Long practitionerId, String practitionerName, String positionName) {
}
