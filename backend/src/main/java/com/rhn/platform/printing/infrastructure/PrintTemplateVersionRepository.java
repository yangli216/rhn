package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintTemplateVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;

public interface PrintTemplateVersionRepository extends JpaRepository<PrintTemplateVersion, Long> {
    Optional<PrintTemplateVersion> findByTemplateIdAndVersionNo(Long templateId, int versionNo);
    List<PrintTemplateVersion> findByTemplateIdOrderByVersionNoDesc(Long templateId);
}
