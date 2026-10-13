package com.rhn.platform.numbering.web;

import com.rhn.platform.numbering.api.BusinessNumberContext;
import com.rhn.platform.numbering.api.BusinessNumberGenerator;
import com.rhn.platform.numbering.api.BusinessNumberRuleView;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/platform/business-numbering")
@PreAuthorize("hasAnyAuthority('CONFIGURATION.ACCESS','ROLE_ADMIN')")
public class BusinessNumberAdministrationController {
    private final BusinessNumberGenerator numbers;
    private final ExecutionContextProvider contexts;

    public BusinessNumberAdministrationController(BusinessNumberGenerator numbers, ExecutionContextProvider contexts) {
        this.numbers = numbers; this.contexts = contexts;
    }

    @GetMapping("/rules")
    public List<BusinessNumberRuleView> rules() {
        var owner = BusinessNumberContext.from(contexts.requireCurrent());
        return numbers.rules().entrySet().stream().sorted(Map.Entry.comparingByKey()).map(entry -> {
            try {
                var sequence = numbers.inspect(entry.getKey(), owner);
                return new BusinessNumberRuleView(entry.getKey(), entry.getValue(), sequence,
                        sequence.nextSequence() == null ? "EXHAUSTED" : "AVAILABLE",
                        sequence.nextSequence() == null ? "流水已用尽" : null);
            } catch (BusinessException error) {
                return new BusinessNumberRuleView(entry.getKey(), entry.getValue(), null,
                        error.code(), error.getMessage());
            }
        }).toList();
    }
}
