package com.rhn.platform.organization.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** GB/T 2261.1-2003. Java names are internal; persistence and JSON use the standard code. */
public enum PractitionerGender {
    UNKNOWN("0"), MALE("1"), FEMALE("2"), UNSPECIFIED("9");

    private final String code;

    PractitionerGender(String code) { this.code = code; }

    @JsonValue
    public String code() { return code; }

    @JsonCreator
    public static PractitionerGender fromCode(String code) {
        for (PractitionerGender gender : values()) {
            if (gender.code.equals(code)) return gender;
        }
        throw new IllegalArgumentException("性别代码必须为 0、1、2 或 9");
    }
}
