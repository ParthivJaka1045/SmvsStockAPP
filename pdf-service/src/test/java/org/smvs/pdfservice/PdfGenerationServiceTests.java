package org.smvs.pdfservice;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.smvs.pdfservice.dto.DispatchPdfPayload;
import org.smvs.pdfservice.dto.MonthlyReportPdfPayload;
import org.smvs.pdfservice.dto.PurchasePdfPayload;
import org.smvs.pdfservice.dto.RequestPdfPayload;
import org.smvs.pdfservice.service.PdfGenerationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class PdfGenerationServiceTests {

  @Autowired
  private PdfGenerationService pdfGenerationService;

  @Test
  void generatesRequestPdf() {
    RequestPdfPayload payload = new RequestPdfPayload(
        "Gota",
        "13",
        "2026-03-31",
        "Piyush",
        "Coordinator",
        "9974704089",
        "525368",
        "psk.assist@in.smvs.org",
        List.of(
            new RequestPdfPayload.Item("ચોખા", "અનાજ", "કિલો", new BigDecimal("12")),
            new RequestPdfPayload.Item("Chokha", "અનાજ", "કિલો", new BigDecimal("4"))
        )
    );

    assertPdf(pdfGenerationService.generateRequestPdf(payload));
  }

  @Test
  void generatesDispatchPdf() {
    DispatchPdfPayload payload = new DispatchPdfPayload(
        "Gota",
        "Swaminarayan Dham Center",
        "13",
        "2026-03-31",
        "Piyush",
        "9974704089",
        "525368",
        "psk.assist@in.smvs.org",
        List.of(
            new DispatchPdfPayload.Item("ચોખા", new BigDecimal("12")),
            new DispatchPdfPayload.Item("Chokha", new BigDecimal("45"))
        )
    );

    assertPdf(pdfGenerationService.generateDispatchPdf(payload));
  }

  @Test
  void generatesPurchasePdf() {
    PurchasePdfPayload payload = new PurchasePdfPayload(
        "Gota",
        "Shree Traders",
        "55",
        "2026-03-30",
        "2026-03-30",
        List.of(
            new PurchasePdfPayload.Item("મગદાળ", new BigDecimal("18")),
            new PurchasePdfPayload.Item("Besan", new BigDecimal("10"))
        )
    );

    assertPdf(pdfGenerationService.generatePurchasePdf(payload));
  }

  @Test
  void generatesMonthlyReportPdf() {
    MonthlyReportPdfPayload payload = new MonthlyReportPdfPayload(
        "report-1",
        "SMVS MONTHLY STOCK REPORT",
        "2026-03",
        "March_2026",
        "2026-03-30",
        "center",
        "Gota",
        "Gota",
        "તા. 1 થી 30-03-2026",
        "2026-03-31T12:00:00Z",
        "Admin",
        "psk.assist@in.smvs.org",
        new MonthlyReportPdfPayload.Summary(
            new BigDecimal("2"),
            new BigDecimal("57"),
            new BigDecimal("12"),
            new BigDecimal("45")
        ),
        List.of(
            new MonthlyReportPdfPayload.Row("ચોખા", "March_2026", new BigDecimal("57"), BigDecimal.ZERO, new BigDecimal("57")),
            new MonthlyReportPdfPayload.Row("Chokha", "March_2026", BigDecimal.ZERO, new BigDecimal("12"), new BigDecimal("-12"))
        )
    );

    assertPdf(pdfGenerationService.generateMonthlyReportPdf(payload));
  }

  private void assertPdf(byte[] pdfBytes) {
    assertThat(pdfBytes).isNotNull();
    assertThat(pdfBytes.length).isGreaterThan(500);
    assertThat(new String(pdfBytes, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
  }
}
