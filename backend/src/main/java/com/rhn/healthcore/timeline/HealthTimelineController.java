package com.rhn.healthcore.timeline;

import com.rhn.healthcore.mpi.ResidentService;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/residents/{residentId}/timeline")
public class HealthTimelineController {
    private final HealthEventRepository repository;
    private final ResidentService residentService;
    private final JsonCodec jsonCodec;

    public HealthTimelineController(HealthEventRepository repository, ResidentService residentService,
                                    JsonCodec jsonCodec) {
        this.repository = repository;
        this.residentService = residentService;
        this.jsonCodec = jsonCodec;
    }

    @GetMapping
    List<TimelineEventResponse> timeline(@PathVariable Long residentId) {
        residentService.get(residentId);
        return repository.findByTenantIdAndResidentIdOrderByOccurredAtDesc(
                        TenantContext.requireTenantId(), residentId).stream()
                .map(event -> TimelineEventResponse.from(event, jsonCodec))
                .toList();
    }
}
