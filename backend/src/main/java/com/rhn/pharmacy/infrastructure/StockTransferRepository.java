package com.rhn.pharmacy.infrastructure;
import com.rhn.pharmacy.domain.StockTransfer;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
public interface StockTransferRepository extends JpaRepository<StockTransfer, Long> {
    Optional<StockTransfer> findByTenantIdAndRequestCode(Long tenantId, String requestCode);
    List<StockTransfer> findByTenantIdAndSourceSiteIdOrderByRequestedAtDesc(Long tenantId, Long sourceSiteId);
    List<StockTransfer> findByTenantIdAndDestinationSiteIdOrderByRequestedAtDesc(Long tenantId, Long destinationSiteId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from StockTransfer value where value.id=:id and value.tenantId=:tenantId")
    Optional<StockTransfer> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
