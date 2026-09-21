package com.rhn.platform.search.infrastructure;

import com.rhn.platform.search.domain.SearchEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SearchEntryRepository extends JpaRepository<SearchEntry, Long> {
    Optional<SearchEntry> findByScopeTypeAndScopeIdAndTargetTypeAndTargetIdAndSourceKey(
            String scopeType, Long scopeId, String targetType, Long targetId, String sourceKey);

    List<SearchEntry> findByTargetTypeAndTargetId(String targetType, Long targetId);

    List<SearchEntry> findByScopeTypeAndScopeIdAndTargetTypeAndTargetId(
            String scopeType, Long scopeId, String targetType, Long targetId);

    @Query("""
            select e from SearchEntry e
            where e.status = 'ACTIVE' and e.targetType = :targetType
              and (e.scopeType = 'PRODUCT'
                   or (e.scopeType = 'TENANT' and e.scopeId = :tenantId)
                   or (:organizationId is not null and e.scopeType = 'ORGANIZATION'
                       and e.scopeId = :organizationId))
              and (:restrictCandidates = false or e.targetId in :candidateTargetIds)
              and (
                (:chineseInput = true and (
                    (:matchMode = 'PREFIX' and e.searchName like concat(:query, '%'))
                    or (:matchMode = 'CONTAINS' and e.searchName like concat('%', concat(:query, '%')))
                ))
                or (:chineseInput = false and (
                    (:matchMode = 'PREFIX' and (
                        (:inputMode in ('PINYIN', 'ALL') and e.pinyinCode like concat(:query, '%'))
                        or (:inputMode in ('WUBI', 'ALL') and e.wubiCode like concat(:query, '%'))
                        or e.mnemonicCode like concat(:query, '%')
                    ))
                    or (:matchMode = 'CONTAINS' and (
                        (:inputMode in ('PINYIN', 'ALL') and e.pinyinCode like concat('%', concat(:query, '%')))
                        or (:inputMode in ('WUBI', 'ALL') and e.wubiCode like concat('%', concat(:query, '%')))
                        or e.mnemonicCode like concat('%', concat(:query, '%'))
                    ))
                ))
              )
            order by e.primary desc, e.searchName asc, e.targetId asc
            """)
    List<SearchEntry> findMatches(@Param("targetType") String targetType,
                                  @Param("tenantId") Long tenantId,
                                  @Param("organizationId") Long organizationId,
                                  @Param("query") String query,
                                  @Param("chineseInput") boolean chineseInput,
                                  @Param("inputMode") String inputMode,
                                  @Param("matchMode") String matchMode,
                                  @Param("restrictCandidates") boolean restrictCandidates,
                                  @Param("candidateTargetIds") Collection<Long> candidateTargetIds,
                                  Pageable pageable);

    @Query("""
            select e from SearchEntry e
            where e.status = 'ACTIVE' and e.targetType = :targetType
              and (e.scopeType = 'PRODUCT'
                   or (e.scopeType = 'TENANT' and e.scopeId = :tenantId)
                   or (:organizationId is not null and e.scopeType = 'ORGANIZATION'
                       and e.scopeId = :organizationId))
              and (:restrictCandidates = false or e.targetId in :candidateTargetIds)
            order by e.primary desc, e.searchName asc, e.targetId asc
            """)
    List<SearchEntry> findSimilarityCandidates(@Param("targetType") String targetType,
                                                @Param("tenantId") Long tenantId,
                                                @Param("organizationId") Long organizationId,
                                                @Param("restrictCandidates") boolean restrictCandidates,
                                                @Param("candidateTargetIds") Collection<Long> candidateTargetIds,
                                                Pageable pageable);

    @Modifying
    @Query(value = """
            delete from RHN_BD_SEARCH_ENTRY
            where SD_TARGET_TYPE = 'CONCEPT'
              and not exists (
                select 1 from RHN_BD_CONCEPT source
                where source.ID_CONCEPT = RHN_BD_SEARCH_ENTRY.ID_TARGET
              )
            """, nativeQuery = true)
    int deleteOrphanedConceptEntries();

    @Modifying
    @Query(value = """
            delete from RHN_BD_SEARCH_ENTRY
            where SD_TARGET_TYPE = 'MEDICATION'
              and not exists (
                select 1 from RHN_BD_MED source
                where source.ID_MED = RHN_BD_SEARCH_ENTRY.ID_TARGET
              )
            """, nativeQuery = true)
    int deleteOrphanedMedicationEntries();

    @Modifying
    @Query(value = """
            delete from RHN_BD_SEARCH_ENTRY
            where SD_TARGET_TYPE = 'CATALOG_ITEM'
              and not exists (
                select 1 from RHN_BD_CATALOG_ITEM source
                where source.ID_CATALOG_ITEM = RHN_BD_SEARCH_ENTRY.ID_TARGET
              )
            """, nativeQuery = true)
    int deleteOrphanedCatalogItemEntries();

    @Modifying
    @Query(value = """
            delete from RHN_BD_SEARCH_ENTRY
            where SD_SCOPE_TYPE = 'ORGANIZATION'
              and not exists (
                select 1 from RHN_BD_ORG_CATALOG_ITEM source
                where source.ID_TNT = RHN_BD_SEARCH_ENTRY.ID_TNT
                  and source.ID_ORG = RHN_BD_SEARCH_ENTRY.ID_SCOPE
                  and source.ID_CATALOG_ITEM = RHN_BD_SEARCH_ENTRY.ID_TARGET
              )
            """, nativeQuery = true)
    int deleteOrphanedOrganizationEntries();
}
