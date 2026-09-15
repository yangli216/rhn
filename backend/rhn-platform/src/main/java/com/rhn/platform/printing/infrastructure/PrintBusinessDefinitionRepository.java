package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintBusinessDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintBusinessDefinitionRepository extends JpaRepository<PrintBusinessDefinition, Long> {
    Optional<PrintBusinessDefinition> findByTaskCodeAndStatus(String taskCode, String status);
    List<PrintBusinessDefinition> findByStatusOrderByCategoryAscTaskNameAsc(String status);
}
