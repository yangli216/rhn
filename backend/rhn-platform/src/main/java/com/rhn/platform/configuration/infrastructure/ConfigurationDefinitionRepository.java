package com.rhn.platform.configuration.infrastructure;

import com.rhn.platform.configuration.domain.ConfigurationDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface ConfigurationDefinitionRepository extends JpaRepository<ConfigurationDefinition, Long> {
    Optional<ConfigurationDefinition> findByConfigKey(String configKey);

    boolean existsByConfigKey(String configKey);

    List<ConfigurationDefinition> findAllByOrderByUpdatedAtDesc();

    long countByCategoryId(Long categoryId);
}
