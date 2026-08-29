package com.rhn.platform.identityaccess.infrastructure;

import com.rhn.platform.identityaccess.domain.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    Optional<UserAccount> findByTenantIdAndUsernameIgnoreCaseAndStatus(Long tenantId, String username, String status);
    Optional<UserAccount> findByIdAndTenantId(Long id, Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from UserAccount value where value.id = :id and value.tenantId = :tenantId")
    Optional<UserAccount> lockByIdAndTenantId(@Param("id") Long id, @Param("tenantId") Long tenantId);
}
