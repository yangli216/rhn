package com.rhn.healthcore.mpi;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/residents")
public class ResidentController {
    private final ResidentService residentService;

    public ResidentController(ResidentService residentService) {
        this.residentService = residentService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    ResidentResponse create(@Valid @RequestBody CreateResidentRequest request) {
        return residentService.create(request);
    }

    @GetMapping
    List<ResidentResponse> search(@RequestParam String query) {
        return residentService.search(query);
    }

    @GetMapping("/page")
    ResidentPageView page(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) ResidentStatus status,
            @RequestParam(required = false) Boolean deceased,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return residentService.page(query, gender, status, deceased, page, size);
    }

    @GetMapping("/{residentId}")
    ResidentResponse get(@PathVariable Long residentId) {
        return residentService.get(residentId);
    }

    @GetMapping("/{residentId}/profile")
    ResidentProfileResponse profile(@PathVariable Long residentId) {
        return residentService.profile(residentId);
    }

    @PutMapping("/{residentId}/profile")
    ResidentProfileResponse updateProfile(@PathVariable Long residentId,
                                          @Valid @RequestBody UpdateResidentProfileRequest request) {
        return residentService.updateProfile(residentId, request);
    }

    @PostMapping("/{residentId}/merge")
    Map<String, Long> merge(@PathVariable Long residentId, @Valid @RequestBody MergeRequest request) {
        return Map.of("mergeHistoryId", residentService.merge(residentId, request.mergedResidentId(),
                request.reason().trim()));
    }

    @PostMapping("/merges/{mergeHistoryId}/split")
    ResidentResponse split(@PathVariable Long mergeHistoryId, @Valid @RequestBody SplitRequest request) {
        return residentService.split(mergeHistoryId, request.reason().trim());
    }

    @PostMapping("/source-records")
    @ResponseStatus(HttpStatus.CREATED)
    SourceRecordResponse ingestSourceRecord(@Valid @RequestBody CreateSourceRecordRequest request) {
        return residentService.ingestSourceRecord(request);
    }

    @PostMapping("/source-records/{sourceRecordId}/link")
    SourceRecordResponse linkSourceRecord(@PathVariable Long sourceRecordId,
                                          @Valid @RequestBody LinkSourceRecordRequest request) {
        return residentService.linkSourceRecord(sourceRecordId, request.residentId(), request.reason().trim());
    }

    record MergeRequest(@NotNull Long mergedResidentId, @NotBlank @Size(max = 500) String reason) {}
    record SplitRequest(@NotBlank @Size(max = 500) String reason) {}
    record LinkSourceRecordRequest(@NotNull Long residentId, @NotBlank @Size(max = 500) String reason) {}
}
