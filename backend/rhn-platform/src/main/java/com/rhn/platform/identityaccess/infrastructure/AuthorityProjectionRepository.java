package com.rhn.platform.identityaccess.infrastructure;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AuthorityProjectionRepository extends Repository<com.rhn.platform.identityaccess.domain.UserAccount, Long> {
    @Query(value = """
            select distinct concat('ROLE_', role.CD_ACC_ROLE) from RHN_SYS_USER_ROLE_ASSIGN assignment
              join RHN_SYS_ACC_ROLE role
                on role.ID_TNT = assignment.ID_TNT and role.ID_ACC_ROLE = assignment.ID_ACC_ROLE
             where assignment.ID_TNT = :tenantId
               and assignment.ID_USER = :userId
               and assignment.ID_ORG is null
               and assignment.ID_DEPT is null
               and role.SD_STATUS = 'ACTIVE'
               and assignment.DT_VALID_FROM <= :at
               and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > :at)
            union
            select distinct permission.CD_ACC_PERM as code from RHN_SYS_USER_ROLE_ASSIGN assignment
              join RHN_SYS_ACC_ROLE role
                on role.ID_TNT = assignment.ID_TNT and role.ID_ACC_ROLE = assignment.ID_ACC_ROLE
              join RHN_SYS_ROLE_PERM_ASSIGN role_permission
                on role_permission.ID_TNT = assignment.ID_TNT and role_permission.ID_ACC_ROLE = assignment.ID_ACC_ROLE
              join RHN_SYS_ACC_PERM permission
                on permission.ID_TNT = role_permission.ID_TNT and permission.ID_ACC_PERM = role_permission.ID_ACC_PERM
             where assignment.ID_TNT = :tenantId
               and assignment.ID_USER = :userId
               and assignment.ID_ORG is null
               and assignment.ID_DEPT is null
               and role.SD_STATUS = 'ACTIVE'
               and permission.SD_STATUS = 'ACTIVE'
               and assignment.DT_VALID_FROM <= :at
               and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > :at)
               and role_permission.DT_VALID_FROM <= :at
               and (role_permission.DT_VALID_TO is null or role_permission.DT_VALID_TO > :at)
            """, nativeQuery = true)
    List<String> findAuthorities(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                 @Param("at") Instant at);

    @Query(value = """
            select distinct concat('ROLE_', role.CD_ACC_ROLE) from RHN_SYS_USER_ROLE_ASSIGN assignment
              join RHN_SYS_ACC_ROLE role
                on role.ID_TNT = assignment.ID_TNT and role.ID_ACC_ROLE = assignment.ID_ACC_ROLE
             where assignment.ID_TNT = :tenantId
               and assignment.ID_USER = :userId
               and (assignment.ID_ORG is null or assignment.ID_ORG = :organizationId)
               and (assignment.ID_DEPT is null or assignment.ID_DEPT = :departmentId)
               and role.SD_STATUS = 'ACTIVE'
               and assignment.DT_VALID_FROM <= :at
               and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > :at)
            union
            select distinct permission.CD_ACC_PERM as code from RHN_SYS_USER_ROLE_ASSIGN assignment
              join RHN_SYS_ACC_ROLE role
                on role.ID_TNT = assignment.ID_TNT and role.ID_ACC_ROLE = assignment.ID_ACC_ROLE
              join RHN_SYS_ROLE_PERM_ASSIGN role_permission
                on role_permission.ID_TNT = assignment.ID_TNT and role_permission.ID_ACC_ROLE = assignment.ID_ACC_ROLE
              join RHN_SYS_ACC_PERM permission
                on permission.ID_TNT = role_permission.ID_TNT and permission.ID_ACC_PERM = role_permission.ID_ACC_PERM
             where assignment.ID_TNT = :tenantId
               and assignment.ID_USER = :userId
               and (assignment.ID_ORG is null or assignment.ID_ORG = :organizationId)
               and (assignment.ID_DEPT is null or assignment.ID_DEPT = :departmentId)
               and role.SD_STATUS = 'ACTIVE'
               and permission.SD_STATUS = 'ACTIVE'
               and assignment.DT_VALID_FROM <= :at
               and (assignment.DT_VALID_TO is null or assignment.DT_VALID_TO > :at)
               and role_permission.DT_VALID_FROM <= :at
               and (role_permission.DT_VALID_TO is null or role_permission.DT_VALID_TO > :at)
            """, nativeQuery = true)
    List<String> findAuthoritiesForContext(@Param("tenantId") Long tenantId, @Param("userId") Long userId,
                                           @Param("organizationId") Long organizationId,
                                           @Param("departmentId") Long departmentId,
                                           @Param("at") Instant at);
}
