package com.rhn.platform.printing.application;

import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DiagnosticImagePdfRendererTest {
    @Test
    void four_frozen_images_keep_captions_across_pages_and_bad_content_never_produces_a_successful_pdf() throws Exception {
        JsonCodec json = mock(JsonCodec.class);
        when(json.readObject("layout")).thenReturn(Map.of(
                "paper", Map.of("widthMm", 210, "heightMm", 297, "marginMm", 12),
                "title", "检查报告", "blocks", List.of(Map.of("type", "images", "path", "images", "maxHeightMm", 120))));
        var renderer = new ConfigurablePdfRenderer(json);
        var stream = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(600, 450, BufferedImage.TYPE_INT_RGB), "png", stream);
        byte[] bytes = stream.toByteArray();
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        var images = java.util.stream.IntStream.rangeClosed(1, 4).mapToObj(i -> Map.of(
                "contentBase64", Base64.getEncoder().encodeToString(bytes), "contentHash", hash, "caption", "关键图像" + i)).toList();
        byte[] pdf = renderer.render("RHN_PRINT_FLOW_V1", "layout", Map.of("images", images));
        try (PdfReader reader = new PdfReader(pdf)) {
            assertTrue(reader.getNumberOfPages() > 1);
            StringBuilder text = new StringBuilder();
            var extractor = new PdfTextExtractor(reader);
            for (int p = 1; p <= reader.getNumberOfPages(); p++) text.append(extractor.getTextFromPage(p));
            for (int i = 1; i <= 4; i++) assertTrue(text.toString().contains("关键图像" + i));
        }
        assertThrows(IllegalArgumentException.class, () -> renderer.render("RHN_PRINT_FLOW_V1", "layout",
                Map.of("images", List.of(Map.of("contentBase64", Base64.getEncoder().encodeToString(bytes), "contentHash", "wrong")))));
        assertThrows(IllegalArgumentException.class, () -> renderer.render("RHN_PRINT_FLOW_V1", "layout",
                Map.of("images", List.of(Map.of("caption", "图像内容缺失")))));
    }
}
