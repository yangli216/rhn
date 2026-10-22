package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.ClinicalPrintBatch;
import com.rhn.platform.printing.domain.PrintDelivery;
import com.rhn.platform.printing.domain.PrintDeliveryStatus;
import com.rhn.platform.printing.domain.PrintDevice;
import com.rhn.platform.printing.domain.PrintJob;
import com.rhn.platform.printing.domain.PrintOutput;
import com.rhn.platform.printing.infrastructure.ClinicalPrintBatchRepository;
import com.rhn.platform.printing.infrastructure.PrintDeliveryRepository;
import com.rhn.platform.printing.infrastructure.PrintDeviceRepository;
import com.rhn.platform.printing.infrastructure.PrintJobRepository;
import com.rhn.platform.printing.infrastructure.PrintOutputRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * RHN Link（健域端联）工作站打印的分发与回执。PDF 仍由受控打印服务生成；页面在工作站内运行时，
 * 先在此持久保存工作站持久调用的操作编码，再调用 {@code rhn.printing.printPdf}，最后回报结果。
 * 结果不确定时禁止直接重新下发，必须先人工核对纸面结果。
 */
@Service
public class DesktopPrintDeliveryService {
    public static final String CHANNEL = "DESKTOP_LINK";
    private static final Pattern OPERATION_ID = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    private static final Pattern RESULT_CODE = Pattern.compile("^[A-Za-z0-9._:-]{1,80}$");
    private static final Pattern SYSTEM_JOB_NO = Pattern.compile("^[0-9]{1,20}$");

    private final PrintDeliveryRepository deliveries;
    private final PrintJobRepository jobs;
    private final PrintOutputRepository outputs;
    private final PrintDeviceRepository devices;
    private final ClinicalPrintBatchRepository batches;
    private final ExecutionContextProvider contextProvider;

    public DesktopPrintDeliveryService(PrintDeliveryRepository deliveries, PrintJobRepository jobs,
                                       PrintOutputRepository outputs, PrintDeviceRepository devices,
                                       ClinicalPrintBatchRepository batches, ExecutionContextProvider contextProvider) {
        this.deliveries = deliveries; this.jobs = jobs; this.outputs = outputs; this.devices = devices;
        this.batches = batches; this.contextProvider = contextProvider;
    }

    public enum Outcome { SUBMITTED, NOT_EXECUTED, UNCERTAIN }

    @Transactional
    public DesktopPrintDispatchView dispatch(Long deliveryId, long expectedRevision, String operationId) {
        ExecutionContext context = context();
        if (operationId == null || !OPERATION_ID.matcher(operationId).matches()) {
            throw badRequest("PRINT_DESKTOP_OPERATION_INVALID", "工作站操作编码必须是小写 UUID v4");
        }
        Located located = locate(deliveryId, context);
        PrintDelivery delivery = located.delivery;
        requireDesktopChannel(delivery);
        if (delivery.status() == PrintDeliveryStatus.DISPATCHED && operationId.equals(delivery.desktopOperationId())) {
            return dispatchView(located);
        }
        if (delivery.status() == PrintDeliveryStatus.UNCERTAIN) {
            throw conflict("PRINT_DESKTOP_RECONCILE_REQUIRED", "上次工作站打印结果不确定，请先核对纸面结果再重新打印");
        }
        PrintDevice device = delivery.deviceId() == null ? null
                : devices.findByIdAndTenantId(delivery.deviceId(), context.tenantId()).orElse(null);
        String printerName = device == null ? null : Strings.trimToNull(device.queueName());
        if (printerName == null) throw conflict("PRINT_DESKTOP_PRINTER_MISSING", "打印设备未配置工作站打印机名称");
        delivery.dispatchToDesktop(expectedRevision, operationId, printerName);
        deliveries.saveAndFlush(delivery);
        return dispatchView(located);
    }

    @Transactional
    public DesktopPrintDeliveryView report(Long deliveryId, long expectedRevision, String operationId, Outcome outcome,
                                    String systemJobNo, String resultCode) {
        ExecutionContext context = context();
        if (outcome == null) throw badRequest("PRINT_DESKTOP_OUTCOME_INVALID", "工作站打印结果不能为空");
        String code = Strings.trimToNull(resultCode);
        if (code != null && !RESULT_CODE.matcher(code).matches()) {
            throw badRequest("PRINT_DESKTOP_RESULT_CODE_INVALID", "工作站结果码格式不正确");
        }
        String jobNo = Strings.trimToNull(systemJobNo);
        if (jobNo != null && !SYSTEM_JOB_NO.matcher(jobNo).matches()) {
            throw badRequest("PRINT_DESKTOP_JOB_NO_INVALID", "系统打印队列作业号格式不正确");
        }
        Located located = locate(deliveryId, context);
        PrintDelivery delivery = located.delivery;
        requireDesktopChannel(delivery);
        if (operationId == null || !operationId.equals(delivery.desktopOperationId())) {
            throw conflict("PRINT_DESKTOP_OPERATION_MISMATCH", "工作站操作编码与当前下发记录不一致，请刷新后重试");
        }
        if (delivery.status() == targetStatus(outcome)) return stateView(delivery, located.batch);
        ClinicalPrintBatch batch = located.batch;
        switch (outcome) {
            case SUBMITTED -> {
                delivery.desktopSubmitted(expectedRevision, jobNo);
                if (batch != null) batch.sent(context.subjectId());
            }
            case NOT_EXECUTED -> {
                delivery.desktopNotExecuted(expectedRevision, code == null ? "not-executed" : code,
                        "工作站未执行打印，可修正后重新打印");
                if (batch != null) batch.failed(context.subjectId());
            }
            case UNCERTAIN -> delivery.desktopUncertain(expectedRevision, code == null ? "uncertain" : code,
                    "工作站打印结果不确定，可能已进入系统打印队列，请核对纸面结果");
        }
        return save(delivery, batch);
    }

    @Transactional
    public DesktopPrintDeliveryView reconcile(Long deliveryId, long expectedRevision, boolean printed, String note) {
        ExecutionContext context = context();
        String trimmed = Strings.trimToNull(note);
        if (trimmed != null && trimmed.length() > 500) throw badRequest("PRINT_DESKTOP_NOTE_INVALID", "核对说明不能超过 500 个字符");
        if (!printed && trimmed == null) throw badRequest("PRINT_DESKTOP_NOTE_REQUIRED", "判定未出纸时必须填写核对说明");
        Located located = locate(deliveryId, context);
        requireDesktopChannel(located.delivery);
        located.delivery.reconcile(expectedRevision, printed, trimmed);
        if (located.batch != null) {
            if (printed) located.batch.confirmed(context.subjectId());
            else located.batch.failed(context.subjectId());
        }
        return save(located.delivery, located.batch);
    }

    @Transactional
    public DesktopPrintDeliveryView fallBackToBrowser(Long deliveryId, long expectedRevision) {
        ExecutionContext context = context();
        Located located = locate(deliveryId, context);
        requireDesktopChannel(located.delivery);
        located.delivery.fallBackToBrowser(expectedRevision);
        if (located.batch != null) located.batch.sent(context.subjectId());
        return save(located.delivery, located.batch);
    }

    private DesktopPrintDeliveryView save(PrintDelivery delivery, ClinicalPrintBatch batch) {
        deliveries.saveAndFlush(delivery);
        if (batch != null) batches.saveAndFlush(batch);
        return stateView(delivery, batch);
    }

    private PrintDeliveryStatus targetStatus(Outcome outcome) {
        return switch (outcome) {
            case SUBMITTED -> PrintDeliveryStatus.SENT;
            case NOT_EXECUTED -> PrintDeliveryStatus.FAILED;
            case UNCERTAIN -> PrintDeliveryStatus.UNCERTAIN;
        };
    }

    private Located locate(Long deliveryId, ExecutionContext context) {
        PrintDelivery delivery = deliveries.lockByIdAndTenantId(deliveryId, context.tenantId())
                .orElseThrow(() -> notFound("PRINT_DELIVERY_NOT_FOUND", "未找到打印投递记录"));
        PrintJob job = jobs.findByIdAndTenantId(delivery.jobId(), context.tenantId()).orElseThrow();
        PrintOutput output = outputs.findByIdAndTenantId(job.outputId(), context.tenantId()).orElseThrow();
        if (output.organizationId() == null || output.departmentId() == null
                || !context.canAccessOrganization(output.organizationId())
                || !context.canAccessDepartment(output.departmentId())) {
            throw forbidden("PRINT_SOURCE_FORBIDDEN", "无权打印当前工作上下文之外的业务文件");
        }
        ClinicalPrintBatch batch = delivery.batchId() == null ? null
                : batches.lockByIdAndTenantId(delivery.batchId(), context.tenantId()).orElseThrow();
        return new Located(delivery, job, output, batch);
    }

    private void requireDesktopChannel(PrintDelivery delivery) {
        if (!CHANNEL.equals(delivery.channel())) {
            throw conflict("PRINT_DELIVERY_CHANNEL_MISMATCH", "该打印投递不是工作站打印通道");
        }
    }

    private ExecutionContext context() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext()) {
            throw forbidden("PRINT_WORK_CONTEXT_REQUIRED", "打印正式业务文件前必须选择工作机构和科室");
        }
        return context;
    }

    private DesktopPrintDispatchView dispatchView(Located located) {
        PrintDelivery delivery = located.delivery;
        return new DesktopPrintDispatchView(stateView(delivery, located.batch), delivery.desktopOperationId(),
                delivery.desktopPrinterName(), "RHN-" + located.output.id(), located.job.copies(),
                located.output.contentDigest().toLowerCase(Locale.ROOT),
                "/api/platform/printing/outputs/" + located.output.id() + "/content");
    }

    private DesktopPrintDeliveryView stateView(PrintDelivery delivery, ClinicalPrintBatch batch) {
        return new DesktopPrintDeliveryView(delivery.id(), delivery.revision(), delivery.channel(), delivery.status().name(),
                delivery.attemptCount(), delivery.errorCode(), delivery.errorMessage(), delivery.desktopOperationId(),
                delivery.desktopPrinterName(), delivery.systemJobNo(), delivery.sentAt(), delivery.confirmedAt(),
                batch == null ? null : batch.status().name());
    }

    private record Located(PrintDelivery delivery, PrintJob job, PrintOutput output, ClinicalPrintBatch batch) {}

    public record DesktopPrintDeliveryView(Long id, long revision, String channel, String status, int attemptCount,
            String errorCode, String errorMessage, String operationId, String printerName, String systemJobNo,
            Instant sentAt, Instant confirmedAt, String batchStatus) {}

    /** 工作站执行所需的全部参数；jobName 不含患者信息，sha256 为小写十六进制。 */
    public record DesktopPrintDispatchView(DesktopPrintDeliveryView delivery, String operationId, String printerName, String jobName,
            int copies, String sha256, String downloadUrl) {}
}
