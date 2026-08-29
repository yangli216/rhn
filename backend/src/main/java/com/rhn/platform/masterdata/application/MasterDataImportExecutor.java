package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import com.rhn.platform.masterdata.api.MasterDataViews.ServiceView;
import com.rhn.platform.masterdata.domain.MasterDataImportRow;
import com.rhn.platform.masterdata.infrastructure.MasterDataImportRowRepository;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class MasterDataImportExecutor {
    private final MasterDataImportRowRepository rowRepository;
    private final MasterDataApplicationService masterDataService;
    private final MasterDataImportMapping mapping;
    private final JsonCodec jsonCodec;

    MasterDataImportExecutor(MasterDataImportRowRepository rowRepository,
                             MasterDataApplicationService masterDataService,
                             MasterDataImportMapping mapping, JsonCodec jsonCodec) {
        this.rowRepository = rowRepository;
        this.masterDataService = masterDataService;
        this.mapping = mapping;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long execute(Long tenantId, Long batchId, Long rowId, String importType, Long actorId) {
        MasterDataImportRow row = rowRepository.findByIdAndTenantIdAndBatchId(rowId, tenantId, batchId)
                .orElseThrow(() -> notFound("IMPORT_ROW_NOT_FOUND", "未找到导入行"));
        Map<String, Object> normalized = jsonCodec.readObject(row.normalizedJson());
        Long targetId;
        if ("SERVICE".equals(importType)) {
            ServiceView value = masterDataService.createService(mapping.serviceCommand(normalized), null);
            targetId = value.id();
        } else {
            MedicationView value = masterDataService.createMedication(mapping.medicationCommand(normalized), null);
            targetId = value.id();
        }
        row.imported(targetId, actorId);
        rowRepository.save(row);
        return targetId;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long tenantId, Long batchId, Long rowId, String errorsJson, Long actorId) {
        MasterDataImportRow row = rowRepository.findByIdAndTenantIdAndBatchId(rowId, tenantId, batchId)
                .orElseThrow(() -> notFound("IMPORT_ROW_NOT_FOUND", "未找到导入行"));
        row.failed(errorsJson, actorId);
        rowRepository.save(row);
    }
}
