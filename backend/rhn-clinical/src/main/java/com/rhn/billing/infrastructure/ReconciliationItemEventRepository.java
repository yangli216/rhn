package com.rhn.billing.infrastructure;
import com.rhn.billing.domain.ReconciliationItemEvent; import org.springframework.data.jpa.repository.JpaRepository;
public interface ReconciliationItemEventRepository extends JpaRepository<ReconciliationItemEvent,Long>{}
