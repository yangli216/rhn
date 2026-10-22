package com.rhn.platform.printing.domain;

import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_SYS_PRINT_DELIVERY")
public class PrintDelivery {
    @Id @Column(name = "ID_PRINT_DELIV") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_PRINT_BATCH") private Long batchId;
    @Column(name = "ID_PRINT_JOB", nullable = false) private Long jobId;
    @Column(name = "ID_PRINT_DEVICE") private Long deviceId;
    @Column(name = "SD_CHANNEL", nullable = false) private String channel;
    @Enumerated(EnumType.STRING) @Column(name = "SD_STATUS", nullable = false) private PrintDeliveryStatus status;
    @Column(name = "QTY_ATTEMPT", nullable = false) private int attemptCount;
    @Column(name = "CD_ERROR") private String errorCode;
    @Column(name = "DES_ERROR") private String errorMessage;
    @Column(name = "DT_QUEUED") private Instant queuedAt;
    @Column(name = "DT_SENT") private Instant sentAt;
    @Column(name = "DT_CNFRMD") private Instant confirmedAt;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "CD_DESKTOP_OPER") private String desktopOperationId;
    @Column(name = "NA_DESKTOP_PRINTER") private String desktopPrinterName;
    @Column(name = "CD_EXT_PRINT_JOB_NO") private String systemJobNo;

    protected PrintDelivery() {}

    public PrintDelivery(Long tenantId, Long batchId, Long jobId, Long deviceId, String channel) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.batchId = batchId; this.jobId = jobId;
        this.deviceId = deviceId; this.channel = channel; this.status = PrintDeliveryStatus.GENERATED;
        this.updatedAt = Instant.now();
    }

    public void queue(long expectedRevision) {
        requireRevision(expectedRevision); this.status = PrintDeliveryStatus.QUEUED; this.attemptCount++;
        this.queuedAt = Instant.now(); this.updatedAt = queuedAt; clearError();
    }
    public void sent(long expectedRevision) {
        requireRevision(expectedRevision);
        if (this.status != PrintDeliveryStatus.QUEUED) this.attemptCount++;
        this.status = PrintDeliveryStatus.SENT;
        this.sentAt = Instant.now(); this.updatedAt = sentAt; clearError();
    }
    public void confirm(long expectedRevision) {
        requireRevision(expectedRevision); this.status = PrintDeliveryStatus.DEVICE_CONFIRMED;
        this.confirmedAt = Instant.now(); this.updatedAt = confirmedAt; clearError();
    }
    public void fail(long expectedRevision, String code, String message) {
        requireRevision(expectedRevision); this.status = PrintDeliveryStatus.FAILED; this.errorCode = code;
        this.errorMessage = message; this.updatedAt = Instant.now();
    }
    /** 下发到 RHN Link 工作站前先持久保存操作编码；只允许从待投递或已确认未执行的失败状态发起。 */
    public void dispatchToDesktop(long expectedRevision, String operationId, String printerName) {
        requireRevision(expectedRevision);
        requireStatus(PrintDeliveryStatus.QUEUED, PrintDeliveryStatus.FAILED);
        if (status != PrintDeliveryStatus.QUEUED) this.attemptCount++;
        this.status = PrintDeliveryStatus.DISPATCHED;
        this.desktopOperationId = operationId; this.desktopPrinterName = printerName; this.systemJobNo = null;
        this.updatedAt = Instant.now(); clearError();
    }
    public void desktopSubmitted(long expectedRevision, String systemJobNo) {
        requireRevision(expectedRevision); requireStatus(PrintDeliveryStatus.DISPATCHED);
        this.status = PrintDeliveryStatus.SENT; this.systemJobNo = systemJobNo;
        this.sentAt = Instant.now(); this.updatedAt = sentAt; clearError();
    }
    public void desktopNotExecuted(long expectedRevision, String code, String message) {
        requireRevision(expectedRevision); requireStatus(PrintDeliveryStatus.DISPATCHED);
        this.status = PrintDeliveryStatus.FAILED; this.errorCode = code; this.errorMessage = message;
        this.updatedAt = Instant.now();
    }
    public void desktopUncertain(long expectedRevision, String code, String message) {
        requireRevision(expectedRevision); requireStatus(PrintDeliveryStatus.DISPATCHED);
        this.status = PrintDeliveryStatus.UNCERTAIN; this.errorCode = code; this.errorMessage = message;
        this.updatedAt = Instant.now();
    }
    /** 人工核对纸面结果：已提交或结果不确定的工作站投递才能确认出纸或判定未出纸。 */
    public void reconcile(long expectedRevision, boolean printed, String note) {
        requireRevision(expectedRevision); requireStatus(PrintDeliveryStatus.SENT, PrintDeliveryStatus.UNCERTAIN);
        if (printed) { this.status = PrintDeliveryStatus.DEVICE_CONFIRMED; this.confirmedAt = Instant.now(); this.updatedAt = confirmedAt; clearError(); }
        else { this.status = PrintDeliveryStatus.FAILED; this.errorCode = "PRINT_DESKTOP_NOT_PRINTED"; this.errorMessage = note; this.updatedAt = Instant.now(); }
    }
    /** 页面不在 RHN Link 中时改由浏览器打印，投递通道如实记为 BROWSER_PDF。 */
    public void fallBackToBrowser(long expectedRevision) {
        requireRevision(expectedRevision); requireStatus(PrintDeliveryStatus.QUEUED, PrintDeliveryStatus.FAILED);
        if (status != PrintDeliveryStatus.QUEUED) this.attemptCount++;
        this.channel = "BROWSER_PDF"; this.status = PrintDeliveryStatus.SENT;
        this.sentAt = Instant.now(); this.updatedAt = sentAt; clearError();
    }
    private void requireStatus(PrintDeliveryStatus... allowed) {
        for (PrintDeliveryStatus value : allowed) if (status == value) return;
        throw new BusinessException("PRINT_DELIVERY_STATE_INVALID", "打印投递当前状态不允许该操作，请刷新后重试", HttpStatus.CONFLICT);
    }
    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new BusinessException(
                "PRINT_DELIVERY_REVISION_CONFLICT", "打印投递状态已变化，请刷新后重试", HttpStatus.CONFLICT);
    }
    private void clearError() { this.errorCode = null; this.errorMessage = null; }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long tenantId() { return tenantId; }
    public Long batchId() { return batchId; }
    public Long jobId() { return jobId; }
    public Long deviceId() { return deviceId; }
    public String channel() { return channel; }
    public PrintDeliveryStatus status() { return status; }
    public int attemptCount() { return attemptCount; }
    public String errorCode() { return errorCode; }
    public String errorMessage() { return errorMessage; }
    public Instant queuedAt() { return queuedAt; }
    public Instant sentAt() { return sentAt; }
    public Instant confirmedAt() { return confirmedAt; }
    public Instant updatedAt() { return updatedAt; }
    public String desktopOperationId() { return desktopOperationId; }
    public String desktopPrinterName() { return desktopPrinterName; }
    public String systemJobNo() { return systemJobNo; }
}
