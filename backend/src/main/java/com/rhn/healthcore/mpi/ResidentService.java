package com.rhn.healthcore.mpi;

import cn.hutool.core.util.StrUtil;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ResidentService implements ResidentDirectory {
    private static final String ACTIVE = "ACTIVE";

    private final ResidentRepository residentRepository;
    private final ResidentIdentifierRepository identifierRepository;
    private final ResidentSourceRecordRepository sourceRecordRepository;
    private final ResidentMatchCandidateRepository candidateRepository;
    private final ResidentMergeHistoryRepository mergeHistoryRepository;
    private final ResidentSplitHistoryRepository splitHistoryRepository;
    private final ResidentDemographicProfileRepository demographicProfileRepository;
    private final ResidentAddressRepository addressRepository;
    private final ResidentRelatedPersonRepository relatedPersonRepository;
    private final ResidentCoverageRepository coverageRepository;
    private final ResidentEmploymentRepository employmentRepository;
    private final TerminologyDirectory terminologyDirectory;
    private final DictionaryDirectory dictionaryDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider executionContextProvider;
    private final JsonCodec jsonCodec;
    private final Clock clock = Clock.systemUTC();

    public ResidentService(ResidentRepository residentRepository,
                           ResidentIdentifierRepository identifierRepository,
                           ResidentSourceRecordRepository sourceRecordRepository,
                           ResidentMatchCandidateRepository candidateRepository,
                           ResidentMergeHistoryRepository mergeHistoryRepository,
                           ResidentSplitHistoryRepository splitHistoryRepository,
                           ResidentDemographicProfileRepository demographicProfileRepository,
                           ResidentAddressRepository addressRepository,
                           ResidentRelatedPersonRepository relatedPersonRepository,
                           ResidentCoverageRepository coverageRepository,
                           ResidentEmploymentRepository employmentRepository,
                           TerminologyDirectory terminologyDirectory,
                           DictionaryDirectory dictionaryDirectory,
                           OrganizationDirectory organizationDirectory,
                           DomainEventPublisher eventPublisher,
                           ExecutionContextProvider executionContextProvider,
                           JsonCodec jsonCodec) {
        this.residentRepository = residentRepository;
        this.identifierRepository = identifierRepository;
        this.sourceRecordRepository = sourceRecordRepository;
        this.candidateRepository = candidateRepository;
        this.mergeHistoryRepository = mergeHistoryRepository;
        this.splitHistoryRepository = splitHistoryRepository;
        this.demographicProfileRepository = demographicProfileRepository;
        this.addressRepository = addressRepository;
        this.relatedPersonRepository = relatedPersonRepository;
        this.coverageRepository = coverageRepository;
        this.employmentRepository = employmentRepository;
        this.terminologyDirectory = terminologyDirectory;
        this.dictionaryDirectory = dictionaryDirectory;
        this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher;
        this.executionContextProvider = executionContextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    public ResidentResponse create(CreateResidentRequest request) {
        Long tenantId = TenantContext.requireTenantId();
        terminologyDirectory.requireValueSetMember(tenantId, MpiTerminologyCodes.RESIDENT_GENDER_VALUE_SET,
                request.gender(),
                java.time.LocalDate.now(clock));
        List<NormalizedIdentifier> identifiers = normalizedIdentifiers(request.nationalId(), request.identifiers());
        if (identifiers.isEmpty()) {
            throw badRequest("RESIDENT_IDENTIFIER_REQUIRED", "至少需要提供一个居民标识");
        }
        identifiers.forEach(identifier -> requireDictionaryValue(tenantId, "PI_IDENTIFIER_TYPE", identifier.system()));
        ensureIdentifiersAvailable(tenantId, identifiers);
        ProfileValues profile = validateProfile(tenantId, request.demographicProfile(), request.addresses(),
                request.relatedPersons(), request.coverages(), request.employments());

        String nationalId = identifiers.stream().filter(identifier -> identifier.system().equals("NATIONAL_ID"))
                .map(NormalizedIdentifier::value).findFirst().orElse(null);
        Resident resident = new Resident(tenantId, nextRecordNo(), request.fullName().trim(), nationalId,
                request.gender(), request.birthDate(), normalize(request.phone()), actor());
        try {
            residentRepository.saveAndFlush(resident);
            List<ResidentIdentifier> saved = identifierRepository.saveAll(identifiers.stream()
                    .map(identifier -> new ResidentIdentifier(tenantId, resident.id(), identifier.system(),
                            identifier.value(), identifier.normalized(), identifier.useType(), null))
                    .toList());
            identifierRepository.flush();
            replaceProfile(tenantId, resident.id(), profile, actor(), false);
            return ResidentResponse.from(resident, saved);
        } catch (DataIntegrityViolationException exception) {
            throw conflict("RESIDENT_DUPLICATE", "至少一个居民标识已存在于主索引中");
        }
    }

    @Transactional(readOnly = true)
    public List<ResidentResponse> search(String query) {
        if (query == null || query.trim().length() < 2) {
            throw badRequest("SEARCH_QUERY_TOO_SHORT", "至少输入 2 个字符");
        }
        Long tenantId = TenantContext.requireTenantId();
        String normalized = query.trim();
        Map<Long, Resident> matches = new LinkedHashMap<>();
        residentRepository.findByTenantIdAndStatusAndFullNameContainingIgnoreCase(
                        tenantId, ResidentStatus.ACTIVE, normalized, PageRequest.of(0, 20))
                .forEach(resident -> matches.put(resident.id(), resident));
        identifierRepository.findTop20ByTenantIdAndNormalizedValueContainingIgnoreCaseAndStatus(
                        tenantId, normalizeIdentifierValue(normalized), ACTIVE)
                .forEach(identifier -> residentRepository.findByIdAndTenantId(identifier.residentId(), tenantId)
                        .filter(resident -> resident.status() == ResidentStatus.ACTIVE)
                        .ifPresent(resident -> matches.putIfAbsent(resident.id(), resident)));
        return matches.values().stream().limit(20).map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ResidentResponse get(Long residentId) {
        return toResponse(requireEntity(residentId));
    }

    @Transactional(readOnly = true)
    public ResidentProfileResponse profile(Long residentId) {
        Resident resident = requireEntity(residentId);
        return toProfile(resident);
    }

    @Transactional
    public ResidentProfileResponse updateProfile(Long residentId, UpdateResidentProfileRequest request) {
        Resident resident = requireActive(residentId);
        if (resident.version() != request.expectedVersion()) {
            throw conflict("RESIDENT_REVISION_STALE", "居民档案已被其他用户修改，请刷新后重试");
        }
        Long tenantId = resident.tenantId();
        terminologyDirectory.requireValueSetMember(tenantId, MpiTerminologyCodes.RESIDENT_GENDER_VALUE_SET,
                request.gender(), LocalDate.now(clock));
        if (!request.deceased() && request.deceasedAt() != null) {
            throw badRequest("RESIDENT_DECEASED_TIME_INVALID", "未标记死亡时不能填写死亡时间");
        }
        ProfileValues profile = validateProfile(tenantId, request.demographicProfile(), request.addresses(),
                request.relatedPersons(), request.coverages(), request.employments());

        String currentActor = actor();
        resident.updateProfile(request.fullName().trim(), request.gender(), request.birthDate(), normalize(request.phone()),
                request.deceased(), request.deceasedAt(), currentActor);
        replaceProfile(tenantId, resident.id(), profile, currentActor, true);
        residentRepository.flush();
        eventPublisher.publish(tenantId, null, "RESIDENT_PROFILE_UPDATED", 1, "Resident", resident.id(),
                resident.version(), resident.id(), Instant.now(), Map.of(
                        "summary", "居民档案更新",
                        "addressCount", profile.addresses().size(),
                        "relatedPersonCount", profile.relatedPersons().size(),
                        "coverageCount", profile.coverages().size(),
                        "employmentCount", profile.employments().size()));
        return toProfile(resident);
    }

    @Override
    @Transactional(readOnly = true)
    public Long resolveCanonicalResidentId(Long residentId) {
        Resident resident = requireEntity(residentId);
        Set<Long> visited = new LinkedHashSet<>();
        while (resident.status() == ResidentStatus.MERGED) {
            if (resident.mergedIntoId() == null || !visited.add(resident.id()) || visited.size() > 10) {
                throw new IllegalStateException("Invalid resident merge chain");
            }
            resident = requireEntity(resident.mergedIntoId());
        }
        if (resident.status() != ResidentStatus.ACTIVE) {
            throw conflict("RESIDENT_NOT_ACTIVE", "居民主索引当前不可用于业务登记");
        }
        return resident.id();
    }

    @Override
    @Transactional(readOnly = true)
    public ResidentSnapshot requireSnapshot(Long residentId) {
        return requireSnapshot(TenantContext.requireTenantId(), residentId);
    }

    @Override
    @Transactional(readOnly = true)
    public ResidentSnapshot requireSnapshot(Long tenantId, Long residentId) {
        Long canonicalId = resolveCanonicalResidentId(tenantId, residentId);
        Resident resident = requireEntity(tenantId, canonicalId);
        return snapshot(resident);
    }

    private Long resolveCanonicalResidentId(Long tenantId, Long residentId) {
        Resident resident = requireEntity(tenantId, residentId);
        Set<Long> visited = new LinkedHashSet<>();
        while (resident.status() == ResidentStatus.MERGED) {
            if (resident.mergedIntoId() == null || !visited.add(resident.id()) || visited.size() > 10) {
                throw new IllegalStateException("Invalid resident merge chain");
            }
            resident = requireEntity(tenantId, resident.mergedIntoId());
        }
        if (resident.status() != ResidentStatus.ACTIVE) {
            throw conflict("RESIDENT_NOT_ACTIVE", "居民主索引当前不可用于业务登记");
        }
        return resident.id();
    }

    @Override
    @Transactional
    public ResidentSnapshot requireSnapshotForUpdate(Long residentId) {
        Long canonicalId = resolveCanonicalResidentId(residentId);
        Resident resident = residentRepository.findForUpdateByIdAndTenantId(
                        canonicalId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("RESIDENT_NOT_FOUND", "未找到居民"));
        if (resident.status() != ResidentStatus.ACTIVE) {
            throw conflict("RESIDENT_NOT_ACTIVE", "居民主索引当前不可用于业务登记");
        }
        return snapshot(resident);
    }

    private ResidentSnapshot snapshot(Resident resident) {
        return new ResidentSnapshot(resident.id(), resident.healthRecordNo(), resident.fullName(),
                resident.gender(), resident.birthDate(), resident.phone(), resident.deceased());
    }

    @Transactional
    public Long merge(Long survivingResidentId, Long mergedResidentId, String reason) {
        Long tenantId = TenantContext.requireTenantId();
        if (survivingResidentId.equals(mergedResidentId)) {
            throw badRequest("RESIDENT_MERGE_SAME_RECORD", "不能将居民主索引合并到自身");
        }
        Resident survivor = requireActive(survivingResidentId);
        Resident duplicate = requireActive(mergedResidentId);

        List<ResidentIdentifier> movedIdentifiers = activeIdentifiers(tenantId, duplicate.id());
        movedIdentifiers.forEach(identifier -> identifier.assignTo(survivor.id()));
        duplicate.mergeInto(survivor.id());

        List<ResidentSourceRecord> movedSources = sourceRecordRepository
                .findByTenantIdAndResidentId(tenantId, duplicate.id());
        movedSources.forEach(source -> source.reassign(survivor.id(), actor(), "居民主索引合并"));

        ResidentMergeHistory history = mergeHistoryRepository.save(new ResidentMergeHistory(tenantId,
                survivor.id(), duplicate.id(), movedIdentifiers.stream().map(ResidentIdentifier::id).toList(),
                movedSources.stream().map(ResidentSourceRecord::id).toList(), reason, actor()));
        eventPublisher.publish(tenantId, null, "RESIDENT_MERGED", 1, "Resident", survivor.id(),
                survivor.version(), survivor.id(), Instant.now(), Map.of(
                        "summary", "居民主索引合并",
                        "mergedResidentId", duplicate.id(),
                        "mergeHistoryId", history.id(),
                        "reason", reason));
        return history.id();
    }

    @Transactional
    public ResidentResponse split(Long mergeHistoryId, String reason) {
        Long tenantId = TenantContext.requireTenantId();
        ResidentMergeHistory history = mergeHistoryRepository.findByIdAndTenantId(mergeHistoryId, tenantId)
                .orElseThrow(() -> notFound("RESIDENT_MERGE_NOT_FOUND", "未找到居民合并记录"));
        if (history.splitAt() != null) {
            throw conflict("RESIDENT_MERGE_ALREADY_SPLIT", "该合并记录已经执行过拆分");
        }
        Resident restored = requireEntity(history.mergedResidentId());
        Resident survivor = requireActive(history.survivingResidentId());
        restored.restoreFromMerge();

        List<ResidentIdentifier> restoredIdentifiers = identifierRepository.findAllById(history.movedIdentifierIds());
        restoredIdentifiers.stream().filter(identifier -> identifier.residentId().equals(survivor.id()))
                .forEach(identifier -> identifier.assignTo(restored.id()));
        sourceRecordRepository.findAllById(history.movedSourceRecordIds()).stream()
                .filter(source -> survivor.id().equals(source.residentId()))
                .forEach(source -> source.reassign(restored.id(), actor(), "撤销居民主索引合并"));

        history.markSplit();
        splitHistoryRepository.save(new ResidentSplitHistory(tenantId, history.id(), restored.id(),
                restoredIdentifiers.stream().map(ResidentIdentifier::id).toList(), reason, actor()));
        eventPublisher.publish(tenantId, null, "RESIDENT_SPLIT", 1, "Resident", restored.id(),
                restored.version(), restored.id(), Instant.now(), Map.of(
                        "summary", "撤销居民主索引合并",
                        "mergeHistoryId", history.id(),
                        "survivingResidentId", survivor.id(),
                        "reason", reason));
        return toResponse(restored);
    }

    @Transactional
    public SourceRecordResponse ingestSourceRecord(CreateSourceRecordRequest request) {
        Long tenantId = TenantContext.requireTenantId();
        organizationDirectory.requireOrganization(tenantId, request.sourceOrganizationId());
        String sourceSystem = request.sourceSystem().trim().toUpperCase(Locale.ROOT);
        String sourceRecordId = request.sourceRecordId().trim();
        if (sourceRecordRepository.findByTenantIdAndSourceSystemAndSourceRecordId(
                tenantId, sourceSystem, sourceRecordId).isPresent()) {
            throw conflict("SOURCE_RECORD_DUPLICATE", "该来源记录已经接入居民主索引");
        }

        ResidentSourceRecord source = sourceRecordRepository.save(new ResidentSourceRecord(tenantId,
                request.sourceOrganizationId(), sourceSystem, sourceRecordId, serialize(request)));
        List<NormalizedIdentifier> identifiers = normalizedIdentifiers(null, request.identifiers());
        Set<Long> exactMatches = new LinkedHashSet<>();
        identifiers.forEach(identifier -> identifierRepository
                .findByTenantIdAndIdentifierSystemAndNormalizedValueAndStatus(
                        tenantId, identifier.system(), identifier.normalized(), ACTIVE)
                .ifPresent(match -> exactMatches.add(match.residentId())));

        if (exactMatches.size() == 1) {
            Long residentId = resolveCanonicalResidentId(exactMatches.iterator().next());
            source.link(residentId, actor(), "标识精确匹配");
            return SourceRecordResponse.from(source, List.of());
        }
        if (exactMatches.size() > 1) {
            throw conflict("SOURCE_RECORD_IDENTIFIER_CONFLICT", "来源记录中的标识指向不同居民，需要先处理冲突");
        }

        List<ResidentMatchCandidate> candidates = new ArrayList<>();
        residentRepository.findTop10ByTenantIdAndStatusAndFullNameIgnoreCaseAndBirthDate(
                        tenantId, ResidentStatus.ACTIVE, request.fullName().trim(), request.birthDate())
                .forEach(resident -> candidates.add(candidateRepository.save(new ResidentMatchCandidate(
                        tenantId, source.id(), resident.id(), demographicScore(resident, request),
                        "[\"NAME_EXACT\",\"BIRTH_DATE_EXACT\"]"))));
        if (!candidates.isEmpty()) {
            source.requireReview();
        }
        return SourceRecordResponse.from(source, candidates);
    }

    @Transactional
    public SourceRecordResponse linkSourceRecord(Long sourceRecordId, Long residentId, String reason) {
        Long tenantId = TenantContext.requireTenantId();
        ResidentSourceRecord source = sourceRecordRepository.findByIdAndTenantId(sourceRecordId, tenantId)
                .orElseThrow(() -> notFound("SOURCE_RECORD_NOT_FOUND", "未找到居民来源记录"));
        Long canonicalResidentId = resolveCanonicalResidentId(residentId);
        String currentActor = actor();
        source.link(canonicalResidentId, currentActor, reason);
        List<ResidentMatchCandidate> candidates = candidateRepository
                .findBySourceRecordIdOrderByMatchScoreDesc(sourceRecordId);
        candidates.forEach(candidate -> {
            if (candidate.candidateResidentId().equals(canonicalResidentId)) candidate.accept(currentActor);
            else candidate.reject(currentActor);
        });
        return SourceRecordResponse.from(source, candidates);
    }

    Resident requireEntity(Long residentId) {
        return requireEntity(TenantContext.requireTenantId(), residentId);
    }

    private Resident requireEntity(Long tenantId, Long residentId) {
        return residentRepository.findByIdAndTenantId(residentId, tenantId)
                .orElseThrow(() -> notFound("RESIDENT_NOT_FOUND", "未找到居民"));
    }

    private Resident requireActive(Long residentId) {
        Resident resident = requireEntity(residentId);
        if (resident.status() != ResidentStatus.ACTIVE) {
            throw conflict("RESIDENT_NOT_ACTIVE", "只有有效居民主索引可以参与合并");
        }
        return resident;
    }

    private ResidentResponse toResponse(Resident resident) {
        return ResidentResponse.from(resident, activeIdentifiers(resident.tenantId(), resident.id()));
    }

    private ResidentProfileResponse toProfile(Resident resident) {
        Long tenantId = resident.tenantId();
        return ResidentProfileResponse.from(toResponse(resident), demographicProfileRepository
                        .findByTenantIdAndResidentId(tenantId, resident.id()).orElse(null),
                addressRepository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(
                        tenantId, resident.id(), ACTIVE),
                relatedPersonRepository.findByTenantIdAndResidentIdAndStatusOrderByEmergencyContactDescIdAsc(
                        tenantId, resident.id(), ACTIVE),
                coverageRepository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(
                        tenantId, resident.id(), ACTIVE),
                employmentRepository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(
                        tenantId, resident.id(), ACTIVE));
    }

    private List<ResidentIdentifier> activeIdentifiers(Long tenantId, Long residentId) {
        return identifierRepository.findByTenantIdAndResidentIdAndStatusOrderByCreatedAt(
                tenantId, residentId, ACTIVE);
    }

    private List<NormalizedIdentifier> normalizedIdentifiers(
            String nationalId, List<ResidentIdentifierInput> inputs) {
        Map<String, NormalizedIdentifier> result = new LinkedHashMap<>();
        if (StrUtil.isNotBlank(nationalId)) {
            NormalizedIdentifier identifier = normalizeIdentifier("NATIONAL_ID", nationalId, "OFFICIAL");
            result.put(identifier.system() + "|" + identifier.normalized(), identifier);
        }
        if (inputs != null) {
            inputs.forEach(input -> {
                NormalizedIdentifier identifier = normalizeIdentifier(input.system(), input.value(), input.useType());
                result.put(identifier.system() + "|" + identifier.normalized(), identifier);
            });
        }
        return List.copyOf(result.values());
    }

    private NormalizedIdentifier normalizeIdentifier(String system, String value, String useType) {
        String normalizedSystem = system.trim().toUpperCase(Locale.ROOT);
        String trimmedValue = value.trim();
        return new NormalizedIdentifier(normalizedSystem, trimmedValue, normalizeIdentifierValue(trimmedValue),
                StrUtil.isBlank(useType) ? "OFFICIAL" : useType.trim().toUpperCase(Locale.ROOT));
    }

    private String normalizeIdentifierValue(String value) {
        return value.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    }

    private void ensureIdentifiersAvailable(Long tenantId, List<NormalizedIdentifier> identifiers) {
        identifiers.forEach(identifier -> identifierRepository
                .findByTenantIdAndIdentifierSystemAndNormalizedValueAndStatus(
                        tenantId, identifier.system(), identifier.normalized(), ACTIVE)
                .ifPresent(existing -> {
                    throw conflict("RESIDENT_DUPLICATE", "居民标识已存在于主索引中");
                }));
    }

    private BigDecimal demographicScore(Resident resident, CreateSourceRecordRequest request) {
        BigDecimal score = new BigDecimal("0.7000");
        if (resident.gender().equals(request.gender())) score = score.add(new BigDecimal("0.1500"));
        if (resident.phone() != null && resident.phone().equals(normalize(request.phone()))) {
            score = score.add(new BigDecimal("0.1500"));
        }
        return score;
    }

    private String serialize(Object value) {
        return jsonCodec.write(value);
    }

    private String nextRecordNo() {
        String time = LocalDateTime.now(clock).format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        return "RHN" + time + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private String normalize(String value) {
        return StrUtil.trimToNull(value);
    }

    private void requireDictionaryValueIfPresent(Long tenantId, String dictionaryCode, String value) {
        if (StrUtil.isNotBlank(value)) requireDictionaryValue(tenantId, dictionaryCode, value);
    }

    private void requireDictionaryValue(Long tenantId, String dictionaryCode, String value) {
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        boolean valid = dictionaryDirectory.resolveActiveItems(tenantId, dictionaryCode).stream()
                .anyMatch(item -> item.code().equals(normalized));
        if (!valid) throw badRequest("RESIDENT_PROFILE_CODE_INVALID", "居民档案选项值无效：" + dictionaryCode);
    }

    private ProfileValues validateProfile(Long tenantId,
                                          UpdateResidentProfileRequest.DemographicProfileInput demographic,
                                          List<UpdateResidentProfileRequest.AddressInput> addressInputs,
                                          List<UpdateResidentProfileRequest.RelatedPersonInput> relatedInputs,
                                          List<UpdateResidentProfileRequest.CoverageInput> coverageInputs,
                                          List<UpdateResidentProfileRequest.EmploymentInput> employmentInputs) {
        List<UpdateResidentProfileRequest.AddressInput> addresses = values(addressInputs);
        List<UpdateResidentProfileRequest.RelatedPersonInput> relatedPersons = values(relatedInputs);
        List<UpdateResidentProfileRequest.CoverageInput> coverages = values(coverageInputs);
        List<UpdateResidentProfileRequest.EmploymentInput> employments = values(employmentInputs);
        requireSinglePrimary(addresses.stream().filter(UpdateResidentProfileRequest.AddressInput::primary).count(),
                "RESIDENT_ADDRESS_PRIMARY_MULTIPLE", "只能设置一个主要地址");
        requireSinglePrimary(coverages.stream().filter(UpdateResidentProfileRequest.CoverageInput::primary).count(),
                "RESIDENT_COVERAGE_PRIMARY_MULTIPLE", "只能设置一个主要保障");
        requireSinglePrimary(employments.stream().filter(UpdateResidentProfileRequest.EmploymentInput::primary).count(),
                "RESIDENT_EMPLOYMENT_PRIMARY_MULTIPLE", "只能设置一个主要工作单位");
        addresses.forEach(value -> {
            requirePeriod(value.validFrom(), value.validTo());
            requireDictionaryValue(tenantId, "PI_ADDRESS_USE", value.sdUse());
        });
        relatedPersons.forEach(value -> {
            requirePeriod(value.validFrom(), value.validTo());
            requireDictionaryValue(tenantId, "PI_RELATED_PERSON_RELATIONSHIP", value.sdRelationship());
        });
        coverages.forEach(value -> {
            requirePeriod(value.validFrom(), value.validTo());
            requireDictionaryValue(tenantId, "INS_COVERAGE_TYPE", value.sdCoverageType());
        });
        employments.forEach(value -> {
            requirePeriod(value.validFrom(), value.validTo());
            requireDictionaryValueIfPresent(tenantId, "PI_OCCUPATION_TYPE", value.sdOccupationType());
        });
        if (demographic != null) {
            requireDictionaryValueIfPresent(tenantId, "PI_RESIDENCY_TYPE", demographic.sdResidencyType());
            requireDictionaryValueIfPresent(tenantId, "PI_MARITAL_STATUS", demographic.sdMaritalStatus());
            requireDictionaryValueIfPresent(tenantId, "PI_EDUCATION_LEVEL", demographic.sdEducationLevel());
            requireDictionaryValueIfPresent(tenantId, "PI_OCCUPATION_TYPE", demographic.sdOccupationType());
            requireDictionaryValueIfPresent(tenantId, "PI_BLOOD_TYPE", demographic.sdBloodType());
            requireDictionaryValueIfPresent(tenantId, "PI_RH_TYPE", demographic.sdRhType());
        }
        return new ProfileValues(demographic, addresses, relatedPersons, coverages, employments);
    }

    private void replaceProfile(Long tenantId, Long residentId, ProfileValues profile, String currentActor,
                                boolean ensureDemographicRecord) {
        if (profile.demographic() != null || ensureDemographicRecord) {
            ResidentDemographicProfile demographic = demographicProfileRepository
                    .findByTenantIdAndResidentId(tenantId, residentId)
                    .orElseGet(() -> new ResidentDemographicProfile(tenantId, residentId));
            demographic.update(profile.demographic(), currentActor);
            demographicProfileRepository.save(demographic);
        }
        addressRepository.deleteByTenantIdAndResidentId(tenantId, residentId);
        relatedPersonRepository.deleteByTenantIdAndResidentId(tenantId, residentId);
        coverageRepository.deleteByTenantIdAndResidentId(tenantId, residentId);
        employmentRepository.deleteByTenantIdAndResidentId(tenantId, residentId);
        addressRepository.saveAll(profile.addresses().stream()
                .map(value -> new ResidentAddress(tenantId, residentId, value, currentActor)).toList());
        relatedPersonRepository.saveAll(profile.relatedPersons().stream()
                .map(value -> new ResidentRelatedPerson(tenantId, residentId, value, currentActor)).toList());
        coverageRepository.saveAll(profile.coverages().stream()
                .map(value -> new ResidentCoverage(tenantId, residentId, value, currentActor)).toList());
        employmentRepository.saveAll(profile.employments().stream()
                .map(value -> new ResidentEmployment(tenantId, residentId, value, currentActor)).toList());
    }

    private void requirePeriod(LocalDate from, LocalDate to) {
        if (to != null && to.isBefore(from)) {
            throw badRequest("RESIDENT_PROFILE_PERIOD_INVALID", "有效结束日期不能早于开始日期");
        }
    }

    private void requireSinglePrimary(long count, String code, String message) {
        if (count > 1) throw badRequest(code, message);
    }

    private <T> List<T> values(List<T> values) {
        return values == null ? List.of() : values;
    }

    private String actor() {
        return executionContextProvider.requireCurrent().actor();
    }

    private record ProfileValues(UpdateResidentProfileRequest.DemographicProfileInput demographic,
                                 List<UpdateResidentProfileRequest.AddressInput> addresses,
                                 List<UpdateResidentProfileRequest.RelatedPersonInput> relatedPersons,
                                 List<UpdateResidentProfileRequest.CoverageInput> coverages,
                                 List<UpdateResidentProfileRequest.EmploymentInput> employments) {}

    private record NormalizedIdentifier(String system, String value, String normalized, String useType) {}
}
