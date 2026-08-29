package com.rhn.platform.identityaccess.infrastructure;

import com.rhn.platform.identityaccess.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByTenantIdAndUsernameIgnoreCaseAndStatus(Long tenantId, String username, String status);
    Optional<UserAccount> findByIdAndTenantId(Long id, Long tenantId);
}
