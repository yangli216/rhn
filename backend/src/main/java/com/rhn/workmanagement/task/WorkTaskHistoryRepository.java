package com.rhn.workmanagement.task;

import org.springframework.data.jpa.repository.JpaRepository;

interface WorkTaskHistoryRepository extends JpaRepository<WorkTaskHistory, Long> {
}
