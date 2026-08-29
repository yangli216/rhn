package com.rhn.healthcore.mpi;

import com.rhn.healthcore.mpi.UpdateResidentProfileRequest.AddressInput;
import com.rhn.healthcore.mpi.UpdateResidentProfileRequest.CoverageInput;
import com.rhn.healthcore.mpi.UpdateResidentProfileRequest.DemographicProfileInput;
import com.rhn.healthcore.mpi.UpdateResidentProfileRequest.EmploymentInput;
import com.rhn.healthcore.mpi.UpdateResidentProfileRequest.RelatedPersonInput;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record CreateResidentRequest(
        @NotBlank(message = "姓名不能为空") @Size(max = 100) String fullName,
        @Size(max = 32) String nationalId,
        @NotBlank(message = "性别不能为空") @Pattern(regexp = "MALE|FEMALE|UNKNOWN", message = "性别值不正确") String gender,
        @NotNull(message = "出生日期不能为空") @PastOrPresent(message = "出生日期不能晚于今天") LocalDate birthDate,
        @Pattern(regexp = "^$|^[0-9+ -]{6,32}$", message = "联系电话格式不正确") String phone,
        @Size(max = 10) List<@Valid ResidentIdentifierInput> identifiers,
        @Valid DemographicProfileInput demographicProfile,
        @Size(max = 10) List<@Valid AddressInput> addresses,
        @Size(max = 20) List<@Valid RelatedPersonInput> relatedPersons,
        @Size(max = 10) List<@Valid CoverageInput> coverages,
        @Size(max = 5) List<@Valid EmploymentInput> employments
) {
}
