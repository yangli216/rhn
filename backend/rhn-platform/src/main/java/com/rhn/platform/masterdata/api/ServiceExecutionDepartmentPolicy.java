package com.rhn.platform.masterdata.api;

import com.rhn.platform.organization.api.DepartmentView;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Uses maintained department types, never department names or fixture identities. */
public final class ServiceExecutionDepartmentPolicy {
    private static final Map<String, String> EXAM_TYPES = Map.ofEntries(
            Map.entry("RADIOGRAPHY", "32.01"), Map.entry("CT", "32.02"),
            Map.entry("MRI", "32.03"), Map.entry("MAGNETIC_RESONANCE", "32.03"),
            Map.entry("NUCLEAR_MEDICINE", "32.04"), Map.entry("ULTRASOUND", "32.05"),
            Map.entry("ECG", "32.06"), Map.entry("ELECTROCARDIOGRAPHY", "32.06"),
            Map.entry("EEG", "32.07"), Map.entry("EMG", "32.08"));

    public record DefaultDepartment(Long departmentId, String departmentName, String source) {}

    public static DefaultDepartment resolve(String serviceType, String examinationType, Long configuredId,
                                            Long organizationId, List<DepartmentView> departments, LocalDate at) {
        var active = departments.stream().filter(d -> organizationId.equals(d.organizationId())
                && "ACTIVE".equals(d.sdOrgStatus()) && !d.virtual() && d.validFrom() != null && !d.validFrom().isAfter(at)
                && (d.validTo() == null || (!d.validTo().isBefore(at) && !d.validTo().isBefore(d.validFrom())))).toList();
        if (configuredId != null) {
            var configured = active.stream().filter(d -> configuredId.equals(d.id())).toList();
            return configured.size() == 1 ? selected(configured.getFirst(), "CONFIGURED")
                    : new DefaultDepartment(null, null, "CONFIGURATION_INVALID");
        }
        if (!"LABORATORY".equals(serviceType) && !"EXAMINATION".equals(serviceType)) return null;
        String specialized = "LABORATORY".equals(serviceType) ? "30" : EXAM_TYPES.get(examinationType == null ? "" : examinationType);
        if (specialized != null) {
            var candidates = active.stream().filter(d -> specialized.equals(d.sdDepartmentType())).toList();
            if (!candidates.isEmpty()) return unique(candidates);
        }
        var candidates = active.stream().filter(d -> "LABORATORY".equals(serviceType)
                ? d.sdDepartmentType() != null && d.sdDepartmentType().startsWith("30.")
                : "32".equals(d.sdDepartmentType())).toList();
        return unique(candidates);
    }

    private static DefaultDepartment unique(List<DepartmentView> candidates) {
        return candidates.size() == 1 ? selected(candidates.getFirst(), "DEPARTMENT_TYPE")
                : new DefaultDepartment(null, null, candidates.isEmpty() ? "MISSING" : "AMBIGUOUS");
    }
    private static DefaultDepartment selected(DepartmentView value, String source) {
        return new DefaultDepartment(value.id(), value.name(), source);
    }
    private ServiceExecutionDepartmentPolicy() {}
}
