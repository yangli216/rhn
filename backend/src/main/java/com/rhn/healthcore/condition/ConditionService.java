package com.rhn.healthcore.condition;

import com.rhn.healthcore.api.ConditionDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ConditionService implements ConditionDirectory {
    private final ConditionRepository repository;

    ConditionService(ConditionRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional
    public ConditionSnapshot ensureSuspected(RecordSuspectedCondition command) {
        return repository.findByTenantIdAndConditionKey(command.tenantId(), command.conditionKey())
                .orElseGet(() -> repository.save(new Condition(command)))
                .snapshot();
    }

    @Override
    @Transactional(readOnly = true)
    public ConditionSnapshot require(Long tenantId, Long conditionId) {
        return repository.findByIdAndTenantId(conditionId, tenantId)
                .orElseThrow(() -> notFound("CONDITION_NOT_FOUND", "未找到病情记录"))
                .snapshot();
    }
}
