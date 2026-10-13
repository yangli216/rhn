package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticPermissions;
import com.rhn.diagnostics.api.DiagnosticImageView;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticImage;
import com.rhn.diagnostics.domain.DiagnosticReportDraft;
import com.rhn.diagnostics.domain.DiagnosticReportImage;
import com.rhn.diagnostics.infrastructure.DiagnosticImageRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportDraftRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticReportImageRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DiagnosticImageService {
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    private static final long MAX_PIXELS = 20_000_000;
    private final DiagnosticExecutionService execution;
    private final DiagnosticReportDraftRepository drafts;
    private final DiagnosticImageRepository images;
    private final DiagnosticReportImageRepository links;
    private final DiagnosticReportAccess access;
    private final ExecutionContextProvider contexts;

    public DiagnosticImageService(DiagnosticExecutionService execution, DiagnosticReportDraftRepository drafts,
                                  DiagnosticImageRepository images, DiagnosticReportImageRepository links,
                                  DiagnosticReportAccess access,
                                  ExecutionContextProvider contexts) {
        this.execution = execution; this.drafts = drafts; this.images = images; this.links = links;
        this.access = access; this.contexts = contexts;
    }

    @Transactional(readOnly = true)
    public List<DiagnosticImageView> draftImages(Long taskId) {
        var task = execution.requireLocalTask(taskId);
        return images.draftMetadata(task.tenantId(), task.id());
    }

    @Transactional
    public DiagnosticImageView upload(Long taskId, long taskRevision, long draftRevision, String commandId,
                            String caption, byte[] bytes) {
        var task = execution.requireLocalTask(taskId);
        requireImaging(task);
        DiagnosticPermissions.require(contexts.requireCurrent(), task.requestType(), "EDIT");
        if (bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw badRequest("DIAGNOSTIC_IMAGE_SIZE_INVALID", "单张关键图像必须在 1 字节至 10MB 之间");
        }
        String hash = hash(bytes);
        String description = Strings.trimToNull(caption);
        var replay = images.findByTenantIdAndTaskIdAndCommandId(task.tenantId(), taskId, commandId).orElse(null);
        if (replay != null) {
            if (!replay.contentHash().equals(hash) || !Objects.equals(description, replay.caption()))
                throw conflict("DIAGNOSTIC_IMAGE_COMMAND_CONFLICT", "同一上传请求不能用于不同图像或说明");
            return view(replay);
        }
        var draft = editable(task, taskRevision, draftRevision);
        if (images.countByTenantIdAndTaskIdAndDraftActiveTrue(task.tenantId(), task.id()) >= 4)
            throw conflict("DIAGNOSTIC_IMAGE_LIMIT", "单份报告最多四张关键图像");
        var info = inspect(bytes);
        var image = images.save(new DiagnosticImage(task.tenantId(), taskId, commandId, hash,
                info.mediaType(), bytes, info.width(), info.height(), description, contexts.requireCurrent().subjectId()));
        touch(draft); images.flush(); drafts.flush();
        return view(image);
    }

    @Transactional
    public void remove(Long taskId, Long imageId, long taskRevision, long draftRevision) {
        var task = execution.requireLocalTask(taskId);
        DiagnosticPermissions.require(contexts.requireCurrent(), task.requestType(), "EDIT");
        var draft = editable(task, taskRevision, draftRevision);
        var image = requireImage(task.tenantId(), imageId);
        if (!image.taskId().equals(taskId) || !image.draftActive())
            throw notFound("DIAGNOSTIC_IMAGE_NOT_FOUND", "未找到此任务的草稿图像");
        image.removeFromDraft(); touch(draft); drafts.flush();
    }

    /** Caller holds the task and draft locks. Every signed version gets an immutable ordered set. */
    @Transactional
    public void freeze(DiagnosticExecutionTask task, Long reportId) {
        int order = 0;
        for (var image : active(task)) {
            verifiedContent(image);
            links.save(new DiagnosticReportImage(task.tenantId(), reportId, image.id(), ++order));
        }
        links.flush();
    }

    @Transactional(readOnly = true)
    public List<DiagnosticImageView> reportImages(Long tenantId, Long reportId) {
        return images.reportMetadata(tenantId, reportId);
    }

    @Transactional(readOnly = true)
    public ImageContent readDraft(Long taskId, Long imageId) {
        var task = execution.requireLocalTask(taskId);
        var image = requireImage(task.tenantId(), imageId);
        if (!image.taskId().equals(task.id()) || !image.draftActive())
            throw notFound("DIAGNOSTIC_IMAGE_NOT_FOUND", "未找到此任务的草稿图像");
        return new ImageContent(image.mediaType(), verifiedContent(image));
    }

    @Transactional(readOnly = true)
    public ImageContent readReport(Long reportId, Long imageId) {
        var context = contexts.requireCurrent();
        access.require(reportId);
        if (links.findByTenantIdAndReportIdOrderBySortOrder(context.tenantId(), reportId).stream()
                .noneMatch(link -> link.imageId().equals(imageId)))
            throw notFound("DIAGNOSTIC_IMAGE_NOT_FOUND", "图像不属于此报告版本");
        var image = requireImage(context.tenantId(), imageId);
        return new ImageContent(image.mediaType(), verifiedContent(image));
    }

    private DiagnosticReportDraft editable(DiagnosticExecutionTask task, long taskRevision, long draftRevision) {
        if (task.revision() != taskRevision) throw conflict("DIAGNOSTIC_TASK_REVISION_CONFLICT", "任务已更新，请重新读取");
        var draft = drafts.lockByTenantIdAndTaskId(task.tenantId(), task.id())
                .orElseThrow(() -> conflict("DIAGNOSTIC_DRAFT_REQUIRED", "请先保存草稿再上传关键图像"));
        if (draft.revision() != draftRevision) throw conflict("DIAGNOSTIC_DRAFT_REVISION_CONFLICT", "草稿已更新，请重新读取");
        if (draft.issuedReportId() != null) throw conflict("DIAGNOSTIC_REPORT_ALREADY_ISSUED", "正式图像已冻结，请先保存更正草稿");
        if (!Set.of("IN_PROGRESS", "COMPLETED").contains(task.status().name()))
            throw conflict("DIAGNOSTIC_IMAGE_TASK_STATE", "此任务当前不能修改图像");
        return draft;
    }

    private void touch(DiagnosticReportDraft draft) {
        var context = contexts.requireCurrent();
        draft.update(draft.content(), context.subjectId(), context.actor());
    }
    private List<DiagnosticImage> active(DiagnosticExecutionTask task) {
        return images.findByTenantIdAndTaskIdAndDraftActiveTrueOrderByCreatedAtAscIdAsc(task.tenantId(), task.id());
    }
    private void requireImaging(DiagnosticExecutionTask task) {
        if (!"EXAMINATION".equals(task.requestType())) throw badRequest("DIAGNOSTIC_IMAGE_CATEGORY", "关键图像仅用于检查报告");
    }
    private DiagnosticImage requireImage(Long tenantId, Long imageId) {
        return images.findByIdAndTenantId(imageId, tenantId).orElseThrow(() -> notFound("DIAGNOSTIC_IMAGE_NOT_FOUND", "未找到关键图像"));
    }
    private DiagnosticImageView view(DiagnosticImage image) {
        return new DiagnosticImageView(image.id(), image.contentHash(), image.mediaType(), image.byteSize(),
                image.width(), image.height(), image.caption(), image.createdBy(), image.createdAt());
    }
    private byte[] verifiedContent(DiagnosticImage image) {
        byte[] content = image.content();
        if (!hash(content).equals(image.contentHash())) throw conflict("DIAGNOSTIC_IMAGE_CORRUPTED", "关键图像校验失败，不能继续签发或打印");
        return content;
    }
    private ImageInfo inspect(byte[] content) {
        ImageReader reader = null;
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw badRequest("DIAGNOSTIC_IMAGE_FORMAT_INVALID", "请上传真实 JPG 或 PNG 图像");
            reader = readers.next(); reader.setInput(stream, true, true);
            String format = reader.getFormatName().toUpperCase(java.util.Locale.ROOT);
            if (!Set.of("PNG", "JPEG", "JPG").contains(format)) throw badRequest("DIAGNOSTIC_IMAGE_FORMAT_INVALID", "仅支持 JPG 或 PNG");
            int width = reader.getWidth(0), height = reader.getHeight(0);
            if (width < 1 || height < 1 || (long) width * height > MAX_PIXELS)
                throw badRequest("DIAGNOSTIC_IMAGE_PIXELS_INVALID", "图像不能超过 2000 万像素");
            if (reader.read(0) == null) throw new IOException("Image cannot be decoded");
            return new ImageInfo("PNG".equals(format) ? "image/png" : "image/jpeg", width, height);
        } catch (IOException exception) {
            throw badRequest("DIAGNOSTIC_IMAGE_FORMAT_INVALID", "图像损坏或无法解码");
        } finally {
            if (reader != null) reader.dispose();
        }
    }
    private String hash(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    private record ImageInfo(String mediaType, int width, int height) {}
    public record ImageContent(String mediaType, byte[] bytes) {}
}
