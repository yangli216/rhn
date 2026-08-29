package com.rhn.platform.identityaccess.infrastructure;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AuthorityProjectionRepository extends Repository<com.rhn.platform.identityaccess.domain.UserAccount, Long> {
    @Query(value = """
            select distinct concat('ROLE_', role.code)
              from user_role_assignments assignment
              join access_roles role
                on role.tenant_id = assignment.tenant_id and role.id = assignment.role_id
             where assignment.tenant_id = :tenantId
               and assignment.user_id = :userId
               and role.status = 'ACTIVE'
               and assignment.valid_from <= :at
               and (assignment.valid_to is null or assignment.valid_to > :at)
            union
            select distinct permission.code
              from user_role_assignments assignment
              join access_roles role
                on role.tenant_id = assignment.tenant_id and role.id = assignment.role_id
              join role_permission_assignments role_permission
                on role_permission.tenant_id = assignment.tenant_id and role_permission.role_id = assignment.role_id
              join access_permissions permission
                on permission.tenant_id = role_permission.tenant_id and permission.id = role_permission.permission_id
             where assignment.tenant_id = :tenantId
               and assignment.user_id = :userId
               and role.status = 'ACTIVE'
               and permission.status = 'ACTIVE'
               and assignment.valid_from <= :at
               and (assignment.valid_to is null or assignment.valid_to > :at)
               and role_permission.valid_from <= :at
               and (role_permission.valid_to is null or role_permission.valid_to > :at)
            """, nativeQuery = true)
    List<String> findAuthorities(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                 @Param("at") Instant at);
}
