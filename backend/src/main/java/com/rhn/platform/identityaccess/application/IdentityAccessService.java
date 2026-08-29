package com.rhn.platform.identityaccess.application;

import cn.hutool.core.util.StrUtil;
import com.rhn.platform.identityaccess.api.AuthenticatedAccount;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.UserAccountReference;
import com.rhn.platform.identityaccess.infrastructure.AuthorityProjectionRepository;
import com.rhn.platform.identityaccess.infrastructure.UserAccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class IdentityAccessService implements IdentityAccessDirectory {
    private final UserAccountRepository accountRepository;
    private final AuthorityProjectionRepository authorityRepository;

    IdentityAccessService(UserAccountRepository accountRepository,
                          AuthorityProjectionRepository authorityRepository) {
        this.accountRepository = accountRepository;
        this.authorityRepository = authorityRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AuthenticatedAccount> findActiveAccount(Long tenantId, String username) {
        String normalizedUsername = StrUtil.trim(username);
        if (StrUtil.isBlank(normalizedUsername)) return Optional.empty();
        return accountRepository.findByTenantIdAndUsernameIgnoreCaseAndStatus(tenantId, normalizedUsername, "ACTIVE")
                .map(account -> new AuthenticatedAccount(account.id(), account.tenantId(), account.practitionerId(), account.username(),
                        account.passwordHash(), new LinkedHashSet<>(authorityRepository.findAuthorities(
                                tenantId, account.id(), Instant.now()))));
    }

    @Override
    @Transactional(readOnly = true)
    public UserAccountReference requireAccount(Long tenantId, Long accountId) {
        return accountRepository.findByIdAndTenantId(accountId, tenantId)
                .map(account -> new UserAccountReference(account.id(), account.tenantId(), account.practitionerId(),
                        account.username(), account.status()))
                .orElseThrow(() -> notFound("USER_ACCOUNT_NOT_FOUND", "未找到用户账号"));
    }
}
