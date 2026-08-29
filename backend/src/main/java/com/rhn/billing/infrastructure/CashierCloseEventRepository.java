package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.CashierCloseEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CashierCloseEventRepository extends JpaRepository<CashierCloseEvent, Long> {}
