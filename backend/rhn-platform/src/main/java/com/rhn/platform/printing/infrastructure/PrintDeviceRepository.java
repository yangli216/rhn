package com.rhn.platform.printing.infrastructure;

import com.rhn.platform.printing.domain.PrintDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PrintDeviceRepository extends JpaRepository<PrintDevice, Long> {
    List<PrintDevice> findByTenantIdAndStatusOrderByDeviceName(Long tenantId, String status);
    List<PrintDevice> findByTenantIdOrderByDeviceName(Long tenantId);
    Optional<PrintDevice> findByIdAndTenantId(Long id, Long tenantId);
    Optional<PrintDevice> findByTenantIdAndDeviceCode(Long tenantId, String deviceCode);
}
