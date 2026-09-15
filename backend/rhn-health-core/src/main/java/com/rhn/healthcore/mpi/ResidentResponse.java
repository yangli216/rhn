package com.rhn.healthcore.mpi;

import cn.hutool.core.util.StrUtil;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record ResidentResponse(
        Long id,
        String healthRecordNo,
        String fullName,
        String maskedNationalId,
        String gender,
        LocalDate birthDate,
        String phone,
        boolean deceased,
        Instant deceasedAt,
        Instant createdAt,
        String status,
        Long mergedIntoId,
        long version,
        List<IdentifierView> identifiers
) {
    static ResidentResponse from(Resident resident, List<ResidentIdentifier> identifiers) {
        String nationalId = identifiers.stream()
                .filter(identifier -> identifier.identifierSystem().equals("NATIONAL_ID") || identifier.identifierSystem().equals("1"))
                .map(ResidentIdentifier::identifierValue)
                .findFirst().orElse(resident.nationalId());
        return new ResidentResponse(resident.id(), resident.healthRecordNo(), resident.fullName(),
                nationalId == null ? null : mask(nationalId), resident.gender(), resident.birthDate(), resident.phone(),
                resident.deceased(), resident.deceasedAt(), resident.createdAt(), resident.status().name(),
                resident.mergedIntoId(), resident.version(), identifiers.stream()
                .map(identifier -> new IdentifierView(identifier.id(), identifier.identifierSystem(),
                        mask(identifier.identifierValue()), identifier.useType(), identifier.status()))
                .toList());
    }

    private static String mask(String value) {
        if (value.length() <= 8) {
            return "****";
        }
        return StrUtil.hide(value, 4, value.length() - 4).toString();
    }

    public record IdentifierView(Long id, String system, String maskedValue, String useType, String status) {}
}
