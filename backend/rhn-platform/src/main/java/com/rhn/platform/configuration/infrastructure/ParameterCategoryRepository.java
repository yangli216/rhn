package com.rhn.platform.configuration.infrastructure;

import com.rhn.platform.configuration.domain.ParameterCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ParameterCategoryRepository extends JpaRepository<ParameterCategory, Long> {
    boolean existsByCode(String code);

    List<ParameterCategory> findAllByOrderBySortOrderAscNameAsc();
}
