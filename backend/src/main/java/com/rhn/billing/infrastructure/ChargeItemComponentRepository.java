package com.rhn.billing.infrastructure;

import com.rhn.billing.domain.ChargeItemComponent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChargeItemComponentRepository extends JpaRepository<ChargeItemComponent, Long> {}
