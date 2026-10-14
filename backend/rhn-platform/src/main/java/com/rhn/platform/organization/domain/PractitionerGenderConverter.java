package com.rhn.platform.organization.domain;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class PractitionerGenderConverter implements AttributeConverter<PractitionerGender, String> {
    @Override
    public String convertToDatabaseColumn(PractitionerGender gender) {
        return gender == null ? null : gender.code();
    }

    @Override
    public PractitionerGender convertToEntityAttribute(String code) {
        return code == null ? null : PractitionerGender.fromCode(code);
    }
}
