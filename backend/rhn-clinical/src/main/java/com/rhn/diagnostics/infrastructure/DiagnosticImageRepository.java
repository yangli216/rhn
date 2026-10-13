package com.rhn.diagnostics.infrastructure;

import com.rhn.diagnostics.domain.DiagnosticImage;
import com.rhn.diagnostics.api.DiagnosticImageView;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface DiagnosticImageRepository extends JpaRepository<DiagnosticImage, Long> {
    Optional<DiagnosticImage> findByIdAndTenantId(Long id, Long tenantId);
    Optional<DiagnosticImage> findByTenantIdAndTaskIdAndCommandId(Long tenantId, Long taskId, String commandId);
    List<DiagnosticImage> findByTenantIdAndTaskIdAndDraftActiveTrueOrderByCreatedAtAscIdAsc(Long tenantId, Long taskId);
    long countByTenantIdAndTaskIdAndDraftActiveTrue(Long tenantId, Long taskId);
    @Query("""
            select new com.rhn.diagnostics.api.DiagnosticImageView(
                image.id, image.contentHash, image.mediaType, image.byteSize, image.width, image.height,
                image.caption, image.createdBy, image.createdAt)
            from DiagnosticImage image
            where image.tenantId = :tenantId and image.taskId = :taskId and image.draftActive = true
            order by image.createdAt, image.id
            """)
    List<DiagnosticImageView> draftMetadata(Long tenantId, Long taskId);
    @Query("""
            select new com.rhn.diagnostics.api.DiagnosticImageView(
                image.id, image.contentHash, image.mediaType, image.byteSize, image.width, image.height,
                image.caption, image.createdBy, image.createdAt)
            from DiagnosticReportImage link, DiagnosticImage image
            where link.tenantId = :tenantId and link.reportId = :reportId
              and image.id = link.imageId and image.tenantId = link.tenantId
            order by link.sortOrder
            """)
    List<DiagnosticImageView> reportMetadata(Long tenantId, Long reportId);
}
