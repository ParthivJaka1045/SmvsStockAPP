package org.smvs.pdfservice.controller;

import org.smvs.pdfservice.dto.DispatchPdfPayload;
import org.smvs.pdfservice.dto.MonthlyReportPdfPayload;
import org.smvs.pdfservice.dto.PurchasePdfPayload;
import org.smvs.pdfservice.dto.RequestPdfPayload;
import org.smvs.pdfservice.service.PdfGenerationService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pdfs")
public class PdfController {

  private final PdfGenerationService pdfGenerationService;

  public PdfController(PdfGenerationService pdfGenerationService) {
    this.pdfGenerationService = pdfGenerationService;
  }

  @PostMapping(value = "/request", produces = MediaType.APPLICATION_PDF_VALUE)
  public ResponseEntity<byte[]> generateRequestPdf(@RequestBody RequestPdfPayload payload) {
    return pdfResponse("request.pdf", pdfGenerationService.generateRequestPdf(payload));
  }

  @PostMapping(value = "/dispatch", produces = MediaType.APPLICATION_PDF_VALUE)
  public ResponseEntity<byte[]> generateDispatchPdf(@RequestBody DispatchPdfPayload payload) {
    return pdfResponse("dispatch.pdf", pdfGenerationService.generateDispatchPdf(payload));
  }

  @PostMapping(value = "/purchase", produces = MediaType.APPLICATION_PDF_VALUE)
  public ResponseEntity<byte[]> generatePurchasePdf(@RequestBody PurchasePdfPayload payload) {
    return pdfResponse("purchase.pdf", pdfGenerationService.generatePurchasePdf(payload));
  }

  @PostMapping(value = "/monthly-report", produces = MediaType.APPLICATION_PDF_VALUE)
  public ResponseEntity<byte[]> generateMonthlyReportPdf(@RequestBody MonthlyReportPdfPayload payload) {
    return pdfResponse("monthly-report.pdf", pdfGenerationService.generateMonthlyReportPdf(payload));
  }

  private ResponseEntity<byte[]> pdfResponse(String fileName, byte[] content) {
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_PDF)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.inline().filename(fileName).build().toString()
        )
        .body(content);
  }
}
