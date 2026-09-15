package com.rhn.platform.geography.infrastructure;

import com.rhn.platform.geography.domain.GridAddressNode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GridAddressNodeRepository extends JpaRepository<GridAddressNode, Long> {
    List<GridAddressNode> findAllByOrderBySortOrderAscCodeAsc();
    List<GridAddressNode> findByParentIdOrderBySortOrderAscCodeAsc(Long parentId);
    Optional<GridAddressNode> findByCode(String code);
    boolean existsByParentIdAndName(Long parentId, String name);
    boolean existsByParentIdAndStatus(Long parentId, com.rhn.platform.geography.domain.GridAddressStatus status);
}
