package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintMediaProfile;
import org.junit.jupiter.api.Test;
import org.openpdf.text.Document;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.PdfWriter;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BatchPdfComposerTest {
    @Test
    void sheet_grid_rolls_from_last_slot_to_next_page_without_scaling_up_the_card() throws Exception {
        PrintMediaProfile media = mock(PrintMediaProfile.class);
        when(media.mediaKind()).thenReturn("SHEET");
        when(media.widthMm()).thenReturn(BigDecimal.valueOf(210));
        when(media.heightMm()).thenReturn(BigDecimal.valueOf(297));
        when(media.marginTopMm()).thenReturn(BigDecimal.valueOf(12));
        when(media.marginRightMm()).thenReturn(BigDecimal.valueOf(12));
        when(media.marginBottomMm()).thenReturn(BigDecimal.valueOf(12));
        when(media.marginLeftMm()).thenReturn(BigDecimal.valueOf(12));
        when(media.horizontalGapMm()).thenReturn(BigDecimal.valueOf(4));
        when(media.verticalGapMm()).thenReturn(BigDecimal.valueOf(4));
        when(media.columns()).thenReturn(2);
        when(media.rows()).thenReturn(4);

        byte[] card = cardPdf("label");
        BatchPdfComposer.Result result = new BatchPdfComposer().compose(
                List.of(card, card), "SHEET_GRID", media, 8);

        assertEquals(2, result.pageCount());
        assertEquals(new BatchPdfComposer.Placement(1, 8), result.placements().get(0));
        assertEquals(new BatchPdfComposer.Placement(2, 1), result.placements().get(1));
        PdfReader reader = new PdfReader(result.content());
        assertEquals(2, reader.getNumberOfPages());
        assertEquals(595.3, reader.getPageSize(1).getWidth(), 1.0);
        assertEquals(841.9, reader.getPageSize(1).getHeight(), 1.0);
        assertTrue(reader.getPageContent(1).length > 20);
        assertTrue(reader.getPageContent(2).length > 20);
        reader.close();
    }

    private byte[] cardPdf(String text) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Document document = new Document(new Rectangle(points(70), points(50)), 0, 0, 0, 0);
        PdfWriter.getInstance(document, output);
        document.open();
        document.add(new Paragraph(text));
        document.close();
        return output.toByteArray();
    }

    private float points(float millimeters) { return millimeters * 72f / 25.4f; }
}
