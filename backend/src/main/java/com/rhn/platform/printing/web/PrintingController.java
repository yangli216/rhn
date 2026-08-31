package com.rhn.platform.printing.web;

import com.rhn.platform.printing.api.PrintContent;
import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintRecordView;
import com.rhn.platform.printing.api.PrintTemplateView;
import com.rhn.platform.printing.api.PrintingService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/platform/printing")
public class PrintingController {
    private final PrintingService printingService;

    public PrintingController(PrintingService printingService) { this.printingService = printingService; }

    @GetMapping("/templates")
    List<PrintTemplateView> templates() { return printingService.visibleTemplates(); }

    @GetMapping("/records")
    List<PrintRecordView> records(@RequestParam Long encounterId) {
        return printingService.recordsByEncounter(encounterId);
    }

    @PostMapping("/jobs/{jobId}/reprints")
    PrintReceipt reprint(@PathVariable Long jobId, @Valid @RequestBody ReprintRequest request) {
        return printingService.reprint(jobId, request.copies());
    }

    @GetMapping("/outputs/{outputId}/content")
    ResponseEntity<byte[]> output(@PathVariable Long outputId) {
        PrintContent content = printingService.output(outputId);
        byte[] body = content.content();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(content.fileName(), StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(content.mediaType()))
                .contentLength(body.length)
                .body(body);
    }

    record ReprintRequest(@Min(1) @Max(10) int copies) {}
}
