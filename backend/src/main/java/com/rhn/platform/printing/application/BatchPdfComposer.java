package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintMediaProfile;
import org.openpdf.text.Document;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.PdfContentByte;
import org.openpdf.text.pdf.PdfCopy;
import org.openpdf.text.pdf.PdfImportedPage;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

@Component
class BatchPdfComposer {
    private static final float POINTS_PER_MM = 72f / 25.4f;

    Result compose(List<byte[]> documents, String layoutStrategy, PrintMediaProfile media, int startSlot) {
        if (documents.isEmpty()) throw new IllegalArgumentException("At least one PDF is required");
        return "SHEET_GRID".equals(layoutStrategy)
                ? composeSheet(documents, media, startSlot) : concatenate(documents);
    }

    private Result concatenate(List<byte[]> documents) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document target = new Document();
        int pages = 0;
        List<Placement> placements = new ArrayList<>();
        try {
            PdfCopy copy = new PdfCopy(target, output);
            target.open();
            for (byte[] source : documents) {
                PdfReader reader = new PdfReader(source);
                try {
                    requireSinglePage(reader);
                    copy.addPage(copy.getImportedPage(reader, 1));
                    pages++;
                    placements.add(new Placement(pages, 1));
                    copy.freeReader(reader);
                } finally {
                    reader.close();
                }
            }
            target.close();
            return new Result(output.toByteArray(), pages, List.copyOf(placements));
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Batch PDF composition failed", exception);
        } finally {
            if (target.isOpen()) target.close();
        }
    }

    private Result composeSheet(List<byte[]> documents, PrintMediaProfile media, int startSlot) {
        if (media == null || media.heightMm() == null || !"SHEET".equals(media.mediaKind())) {
            throw new IllegalArgumentException("Sheet-grid layout requires a fixed-height sheet media profile");
        }
        int columns = media.columns();
        int rows = media.rows();
        int capacity = columns * rows;
        if (capacity < 1 || startSlot < 1 || startSlot > capacity) {
            throw new IllegalArgumentException("Sheet-grid layout requires a valid multi-slot start position");
        }

        float pageWidth = points(media.widthMm().floatValue());
        float pageHeight = points(media.heightMm().floatValue());
        float left = points(media.marginLeftMm().floatValue());
        float right = points(media.marginRightMm().floatValue());
        float top = points(media.marginTopMm().floatValue());
        float bottom = points(media.marginBottomMm().floatValue());
        float horizontalGap = points(media.horizontalGapMm().floatValue());
        float verticalGap = points(media.verticalGapMm().floatValue());
        float cellWidth = (pageWidth - left - right - horizontalGap * (columns - 1)) / columns;
        float cellHeight = (pageHeight - top - bottom - verticalGap * (rows - 1)) / rows;
        if (cellWidth <= 0 || cellHeight <= 0) throw new IllegalArgumentException("Sheet media has no printable area");

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document target = new Document(new Rectangle(pageWidth, pageHeight), 0, 0, 0, 0);
        List<Placement> placements = new ArrayList<>();
        List<PdfReader> readers = new ArrayList<>();
        try {
            PdfWriter writer = PdfWriter.getInstance(target, output);
            target.open();
            int absoluteSlot = startSlot - 1;
            int currentPage = 0;
            for (byte[] source : documents) {
                PdfReader reader = new PdfReader(source);
                readers.add(reader);
                requireSinglePage(reader);
                int pageNo = absoluteSlot / capacity + 1;
                int slotNo = absoluteSlot % capacity + 1;
                while (currentPage < pageNo) {
                    target.newPage();
                    currentPage++;
                }

                int zeroBased = slotNo - 1;
                int row = zeroBased / columns;
                int column = zeroBased % columns;
                float cellX = left + column * (cellWidth + horizontalGap);
                float cellY = pageHeight - top - (row + 1) * cellHeight - row * verticalGap;
                Rectangle sourceSize = reader.getPageSizeWithRotation(1);
                float scale = Math.min(1f,
                        Math.min(cellWidth / sourceSize.getWidth(), cellHeight / sourceSize.getHeight()));
                float x = cellX + (cellWidth - sourceSize.getWidth() * scale) / 2f;
                float y = cellY + (cellHeight - sourceSize.getHeight() * scale) / 2f;
                PdfImportedPage imported = writer.getImportedPage(reader, 1);
                PdfContentByte canvas = writer.getDirectContent();
                canvas.addTemplate(imported, scale, 0, 0, scale, x, y);
                placements.add(new Placement(pageNo, slotNo));
                absoluteSlot++;
            }
            target.close();
            return new Result(output.toByteArray(), placements.get(placements.size() - 1).pageNo(),
                    List.copyOf(placements));
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Sheet PDF composition failed", exception);
        } finally {
            readers.forEach(PdfReader::close);
            if (target.isOpen()) target.close();
        }
    }

    private void requireSinglePage(PdfReader reader) {
        if (reader.getNumberOfPages() != 1) {
            throw new IllegalArgumentException("Each logical card must contain exactly one PDF page");
        }
    }

    private float points(float millimeters) { return millimeters * POINTS_PER_MM; }

    record Placement(int pageNo, int slotNo) {}
    record Result(byte[] content, int pageCount, List<Placement> placements) {}
}
