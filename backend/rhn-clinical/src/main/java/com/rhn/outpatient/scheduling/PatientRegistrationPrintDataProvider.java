package com.rhn.outpatient.scheduling;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintDataProvider;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintDataSnapshot;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.queueing.api.QueueingDirectory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class PatientRegistrationPrintDataProvider implements PrintDataProvider {
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(ZoneId.of("Asia/Shanghai"));

    private final PatientRegistrationRepository registrationRepository;
    private final ServiceScheduleRepository scheduleRepository;
    private final QueueingDirectory queueing;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final com.rhn.platform.printing.api.RegistrationBillingDirectory billingDirectory;

    PatientRegistrationPrintDataProvider(PatientRegistrationRepository registrationRepository,
                                         ServiceScheduleRepository scheduleRepository,
                                         QueueingDirectory queueing,
                                         ResidentDirectory residentDirectory,
                                         OrganizationDirectory organizationDirectory,
                                         com.rhn.platform.printing.api.RegistrationBillingDirectory billingDirectory) {
        this.registrationRepository = registrationRepository;
        this.scheduleRepository = scheduleRepository;
        this.queueing = queueing;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.billingDirectory = billingDirectory;
    }

    @Override
    public String providerCode() {
        return "PATIENT_REGISTRATION";
    }

    @Override
    public PrintDataSnapshot load(PrintDataRequest request) {
        if (!PrintTaskCodes.OUTPATIENT_REGISTRATION_TICKET.equals(request.taskCode())) {
            throw conflict("PRINT_TASK_SOURCE_MISMATCH", "挂号凭条数据提供器不支持当前打印任务");
        }
        Long tenantId = TenantContext.requireTenantId();
        PatientRegistration registration = registrationRepository.findByIdAndTenantId(request.source().sourceId(), tenantId)
                .orElseThrow(() -> notFound("PATIENT_REGISTRATION_NOT_FOUND", "未找到挂号记录"));
        if (registration.status() == PatientRegistrationStatus.CANCELLED) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "已退号的挂号记录不能生成打印文件");
        }
        QueueingDirectory.TicketSnapshot ticket = queueing.requireBySource("PAT_REG", registration.id());
        ServiceSchedule schedule = scheduleRepository.findByIdAndTenantId(registration.scheduleId(), tenantId)
                .orElse(null);
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(registration.residentId());
        OrganizationView organization = organizationDirectory.requireOrganization(tenantId, registration.organizationId());
        DepartmentView department = organizationDirectory.requireDepartment(tenantId, registration.organizationId(), registration.departmentId());

        String locationName = schedule != null && schedule.locationName() != null && !schedule.locationName().isBlank()
                ? schedule.locationName()
                : department.name() + " 诊室";
        String practitionerName = schedule != null && schedule.practitionerName() != null
                ? schedule.practitionerName()
                : "普通门诊";
        String serviceName = schedule != null && schedule.serviceName() != null
                ? schedule.serviceName()
                : "门诊诊疗";
        String sdDayPartText = schedule != null && schedule.dayPart() != null
                ? ("MORNING".equals(schedule.dayPart()) ? "上午出诊" : "AFTERNOON".equals(schedule.dayPart()) ? "下午出诊" : "当日出诊")
                : "当日出诊";

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", "门诊挂号就诊凭条");
        payload.put("organizationName", organization.name());
        payload.put("ticketNo", ticket.ticketCode());
        payload.put("sequenceNo", ticket.sequenceNo());
        payload.put("registrationNo", registration.registrationNo());
        payload.put("barcode", registration.registrationNo());
        payload.put("residentName", resident.fullName());
        payload.put("healthRecordNo", resident.healthRecordNo() != null ? resident.healthRecordNo() : "-");
        payload.put("gender", resident.gender() != null ? resident.gender() : "-");
        payload.put("departmentName", department.name());
        payload.put("locationName", locationName);
        payload.put("practitionerName", practitionerName);
        payload.put("serviceName", serviceName);
        payload.put("sdDayPartText", sdDayPartText);
        var paymentSnapshot = billingDirectory.findPaymentSnapshotByEncounterId(tenantId, registration.encounterId());
        BigDecimal payable = paymentSnapshot.map(com.rhn.platform.printing.api.RegistrationBillingDirectory.RegistrationPaymentSnapshot::payableAmount).orElse(BigDecimal.ZERO);
        String paymentMethodName = paymentSnapshot.map(com.rhn.platform.printing.api.RegistrationBillingDirectory.RegistrationPaymentSnapshot::paymentMethodName).orElse("自费/医保");
        BigDecimal totalFee = paymentSnapshot.map(com.rhn.platform.printing.api.RegistrationBillingDirectory.RegistrationPaymentSnapshot::totalFee).orElse(payable);
        BigDecimal insuranceDeduction = paymentSnapshot.map(com.rhn.platform.printing.api.RegistrationBillingDirectory.RegistrationPaymentSnapshot::insuranceDeduction).orElse(BigDecimal.ZERO);
        BigDecimal discountAmount = paymentSnapshot.map(com.rhn.platform.printing.api.RegistrationBillingDirectory.RegistrationPaymentSnapshot::discountAmount).orElse(BigDecimal.ZERO);

        payload.put("payableAmount", payable.setScale(2, RoundingMode.HALF_UP).toPlainString());
        payload.put("paymentMethodName", paymentMethodName);
        payload.put("baseFee", totalFee.setScale(2, RoundingMode.HALF_UP).toPlainString());
        payload.put("insuranceDeduction", insuranceDeduction.setScale(2, RoundingMode.HALF_UP).toPlainString());
        payload.put("seniorDiscount", discountAmount.setScale(2, RoundingMode.HALF_UP).toPlainString());
        payload.put("registeredAtText", DATE_TIME.format(registration.registeredAt()));
        payload.put("validUntilText", "当日当班有效");

        return new PrintDataSnapshot("PatientRegistration", registration.id(), 1L,
                registration.residentId(), registration.encounterId(), registration.organizationId(),
                registration.departmentId(), "门诊挂号凭条-" + registration.registrationNo() + ".pdf", payload);
    }
}
