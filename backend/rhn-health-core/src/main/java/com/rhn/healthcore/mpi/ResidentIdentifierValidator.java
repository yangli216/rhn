package com.rhn.healthcore.mpi;

import java.time.DateTimeException;
import java.time.LocalDate;

import static com.rhn.shared.api.BusinessErrors.badRequest;

final class ResidentIdentifierValidator {
    private static final int[] WEIGHTS = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
    private static final char[] CHECK_CODES = {'1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'};

    private ResidentIdentifierValidator() {
    }

    static void validateNationalId(String value, LocalDate birthDate, String gender) {
        if (value == null || !value.matches("\\d{17}[0-9X]")) {
            throw badRequest("RESIDENT_NATIONAL_ID_FORMAT_INVALID", "居民身份证号码必须为18位有效号码");
        }
        int sum = 0;
        for (int index = 0; index < WEIGHTS.length; index++) {
            sum += Character.digit(value.charAt(index), 10) * WEIGHTS[index];
        }
        if (value.charAt(17) != CHECK_CODES[sum % 11]) {
            throw badRequest("RESIDENT_NATIONAL_ID_CHECKSUM_INVALID", "居民身份证号码校验码不正确");
        }
        LocalDate idBirthDate;
        try {
            idBirthDate = LocalDate.of(
                    Integer.parseInt(value.substring(6, 10)),
                    Integer.parseInt(value.substring(10, 12)),
                    Integer.parseInt(value.substring(12, 14)));
        } catch (DateTimeException | NumberFormatException exception) {
            throw badRequest("RESIDENT_NATIONAL_ID_BIRTH_DATE_INVALID", "居民身份证号码中的出生日期不正确");
        }
        if (!idBirthDate.equals(birthDate)) {
            throw badRequest("RESIDENT_NATIONAL_ID_BIRTH_DATE_MISMATCH", "出生日期与居民身份证号码不一致");
        }
        boolean male = Character.digit(value.charAt(16), 10) % 2 == 1;
        if ("MALE".equals(gender) && !male || "FEMALE".equals(gender) && male) {
            throw badRequest("RESIDENT_NATIONAL_ID_GENDER_MISMATCH", "性别与居民身份证号码不一致");
        }
    }
}
