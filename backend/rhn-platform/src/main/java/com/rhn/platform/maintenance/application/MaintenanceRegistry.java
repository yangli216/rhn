package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceModels.Dataset;
import com.rhn.platform.maintenance.api.MaintenanceParticipant;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
public class MaintenanceRegistry {
    private final Map<String, MaintenanceParticipant> participants;

    public MaintenanceRegistry(List<MaintenanceParticipant> participants) {
        this.participants = participants.stream().collect(Collectors.toUnmodifiableMap(
                participant -> participant.dataset().code(), Function.identity()));
    }

    public List<Dataset> datasets() {
        return participants.values().stream().map(MaintenanceParticipant::dataset)
                .sorted(java.util.Comparator.comparing(Dataset::code)).toList();
    }

    public MaintenanceParticipant require(String code) {
        MaintenanceParticipant result = participants.get(code);
        if (result == null) throw badRequest("MAINTENANCE_DATASET_UNSUPPORTED", "该业务数据集尚未接入维护能力");
        return result;
    }
}
