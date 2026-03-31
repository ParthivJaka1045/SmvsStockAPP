package org.smvs.pdfservice.service;

import com.itextpdf.kernel.colors.Color;
import com.itextpdf.kernel.colors.DeviceRgb;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.geom.PageSize;
import com.itextpdf.kernel.geom.Rectangle;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfPage;
import com.itextpdf.kernel.pdf.PdfString;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.kernel.pdf.canvas.PdfCanvas;
import com.itextpdf.kernel.pdf.event.AbstractPdfDocumentEvent;
import com.itextpdf.kernel.pdf.event.AbstractPdfDocumentEventHandler;
import com.itextpdf.kernel.pdf.event.PdfDocumentEvent;
import com.itextpdf.layout.Canvas;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.borders.Border;
import com.itextpdf.layout.borders.SolidBorder;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Div;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.element.Text;
import com.itextpdf.layout.properties.HorizontalAlignment;
import com.itextpdf.layout.properties.TextAlignment;
import com.itextpdf.layout.properties.UnitValue;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import org.smvs.pdfservice.dto.DispatchPdfPayload;
import org.smvs.pdfservice.dto.MonthlyReportPdfPayload;
import org.smvs.pdfservice.dto.PurchasePdfPayload;
import org.smvs.pdfservice.dto.RequestPdfPayload;
import org.springframework.stereotype.Service;

@Service
public class PdfGenerationService {

  private static final Color WHITE = new DeviceRgb(255, 255, 255);
  private static final Color BLACK = new DeviceRgb(17, 24, 39);
  private static final Color SLATE_500 = new DeviceRgb(100, 116, 139);
  private static final Color SLATE_400 = new DeviceRgb(148, 163, 184);
  private static final Color GRAY_100 = new DeviceRgb(249, 250, 251);
  private static final Color GRAY_200 = new DeviceRgb(229, 231, 235);
  private static final Color ORANGE = new DeviceRgb(234, 88, 12);
  private static final Color BLUE = new DeviceRgb(37, 99, 235);
  private static final Color VIOLET = new DeviceRgb(109, 40, 217);
  private static final Color EMERALD = new DeviceRgb(16, 185, 129);
  private static final Color EMERALD_SOFT = new DeviceRgb(236, 253, 245);

  private final PdfFontRegistry fontRegistry;

  public PdfGenerationService(PdfFontRegistry fontRegistry) {
    this.fontRegistry = fontRegistry;
  }

  public byte[] generateRequestPdf(RequestPdfPayload payload) {
    return renderDocument((document, pdfDocument, fonts) -> composeRequestPdf(document, fonts, payload));
  }

  public byte[] generateDispatchPdf(DispatchPdfPayload payload) {
    return renderDocument((document, pdfDocument, fonts) -> composeDispatchPdf(document, fonts, payload));
  }

  public byte[] generatePurchasePdf(PurchasePdfPayload payload) {
    return renderDocument((document, pdfDocument, fonts) -> composePurchasePdf(document, fonts, payload));
  }

  public byte[] generateMonthlyReportPdf(MonthlyReportPdfPayload payload) {
    return renderDocument((document, pdfDocument, fonts) -> composeMonthlyReportPdf(document, fonts, payload));
  }

  private byte[] renderDocument(PdfComposer composer) {
    try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
      PdfWriter writer = new PdfWriter(outputStream);
      PdfDocument pdfDocument = new PdfDocument(writer);
      pdfDocument.getCatalog().setLang(new PdfString("gu-IN"));

      PdfFontRegistry.PdfFonts fonts = fontRegistry.createFonts(pdfDocument);
      pdfDocument.addEventHandler(PdfDocumentEvent.END_PAGE, new FooterEventHandler(fonts.latinRegular()));

      try (Document document = new Document(pdfDocument, PageSize.A4)) {
        document.setMargins(28, 26, 36, 26);
        composer.compose(document, pdfDocument, fonts);
      }

      return outputStream.toByteArray();
    } catch (Exception exception) {
      throw new IllegalStateException("PDF generation failed.", exception);
    }
  }

  private void composeRequestPdf(
      Document document,
      PdfFontRegistry.PdfFonts fonts,
      RequestPdfPayload payload
  ) {
    List<RequestPdfPayload.Item> items = safeList(payload.items()).stream()
        .filter(item -> hasText(item.name()))
        .toList();

    addDocumentHeader(
        document,
        fonts,
        "SMVS STOCK REQUEST",
        "Video Post Production Data Report",
        ORANGE,
        TextAlignment.CENTER
    );

    Table infoGrid = createInfoGrid(2);
    infoGrid.addCell(infoCard(fonts, "Center Name", payload.center(), null));
    infoGrid.addCell(infoCard(fonts, "Chalan No", valueWithPrefix("#", payload.chalanNo()), null));
    infoGrid.addCell(infoCard(fonts, "Order Date", formatDisplayDate(payload.date()), null));
    infoGrid.addCell(infoCard(fonts, "Sender", payload.senderName(), null));
    infoGrid.addCell(infoCard(fonts, "Post", payload.post(), null));
    infoGrid.addCell(infoCard(fonts, "Mobile Number", payload.mobileNumber(), null));
    infoGrid.addCell(infoCard(fonts, "Global ID", payload.globalId(), null));
    infoGrid.addCell(infoCard(fonts, "Email", payload.email(), null));
    document.add(infoGrid);

    Table itemsTable = createTable(new float[]{0.9f, 4.8f, 1.4f, 1.5f});
    itemsTable.setMarginTop(18f);
    addTableHeader(itemsTable, fonts, List.of("No", "Item Name", "Qty", "Unit"), BLACK, WHITE);
    if (items.isEmpty()) {
      itemsTable.addCell(emptyStateCell(fonts, 4, "No items"));
    } else {
      for (int index = 0; index < items.size(); index++) {
        RequestPdfPayload.Item item = items.get(index);
        itemsTable.addCell(dataCell(fonts, String.valueOf(index + 1), false, TextAlignment.CENTER, null));
        itemsTable.addCell(dataCell(fonts, item.name(), true, TextAlignment.LEFT, null));
        itemsTable.addCell(dataCell(fonts, formatMetric(item.qty()), true, TextAlignment.CENTER, null));
        itemsTable.addCell(dataCell(fonts, safeText(item.unit()), false, TextAlignment.CENTER, null));
      }
    }
    document.add(itemsTable);

    document.add(summaryBand(
        fonts,
        ORANGE,
        List.of(
            new SummaryMetric("Items", String.valueOf(items.size())),
            new SummaryMetric("Total KG", formatMetric(sumRequestQuantities(items)))
        )
    ));
  }

  private void composeDispatchPdf(
      Document document,
      PdfFontRegistry.PdfFonts fonts,
      DispatchPdfPayload payload
  ) {
    List<DispatchPdfPayload.Item> items = safeList(payload.items()).stream()
        .filter(item -> hasText(item.itemName()))
        .toList();

    addDocumentHeader(
        document,
        fonts,
        "SMVS MATERIAL DISPATCH",
        "Samp Swarup Mandal Video Seva",
        BLUE,
        TextAlignment.CENTER
    );

    Table infoGrid = createInfoGrid(2);
    infoGrid.addCell(infoCard(fonts, "From Center", payload.fromCenter(), null));
    infoGrid.addCell(infoCard(fonts, "Chalan No", valueWithPrefix("#", payload.chalanNo()), null));
    infoGrid.addCell(infoCard(fonts, "Date", formatDisplayDate(payload.date()), null));
    infoGrid.addCell(infoCard(fonts, "To", defaultValue(payload.toCenter(), "Swaminarayan Dham Center"), BLUE));
    infoGrid.addCell(infoCard(fonts, "Sender", payload.senderName(), null));
    infoGrid.addCell(infoCard(fonts, "Mobile", payload.mobileNumber(), null));
    infoGrid.addCell(infoCard(fonts, "Global ID", payload.globalId(), null));
    infoGrid.addCell(infoCard(fonts, "Email", payload.email(), null));
    document.add(infoGrid);

    Table itemsTable = createTable(new float[]{0.9f, 5.2f, 1.5f});
    itemsTable.setMarginTop(18f);
    addTableHeader(itemsTable, fonts, List.of("No", "Item Name", "KG"), BLACK, WHITE);
    if (items.isEmpty()) {
      itemsTable.addCell(emptyStateCell(fonts, 3, "No items"));
    } else {
      for (int index = 0; index < items.size(); index++) {
        DispatchPdfPayload.Item item = items.get(index);
        itemsTable.addCell(dataCell(fonts, String.valueOf(index + 1), false, TextAlignment.CENTER, null));
        itemsTable.addCell(dataCell(fonts, item.itemName(), true, TextAlignment.LEFT, null));
        itemsTable.addCell(dataCell(fonts, formatMetric(item.kg()), true, TextAlignment.CENTER, ORANGE));
      }
    }
    document.add(itemsTable);

    document.add(summaryBand(
        fonts,
        BLUE,
        List.of(
            new SummaryMetric("Items", String.valueOf(items.size())),
            new SummaryMetric("Total KG", formatMetric(sumDispatchQuantities(items)))
        )
    ));
  }

  private void composePurchasePdf(
      Document document,
      PdfFontRegistry.PdfFonts fonts,
      PurchasePdfPayload payload
  ) {
    List<PurchasePdfPayload.Item> items = safeList(payload.items()).stream()
        .filter(item -> hasText(item.itemName()))
        .toList();

    addDocumentHeader(
        document,
        fonts,
        "SMVS PURCHASE REPORT",
        "દુકાન માંથી ખરીદેલ માલ",
        VIOLET,
        TextAlignment.LEFT
    );

    Table infoGrid = createInfoGrid(3);
    infoGrid.addCell(infoCard(fonts, "Center", payload.center(), null));
    infoGrid.addCell(infoCard(fonts, "Shop Name", payload.shopName(), null));
    infoGrid.addCell(infoCard(fonts, "Bill Number", valueWithPrefix("#", payload.billNo()), null));
    infoGrid.addCell(infoCard(fonts, "Bill Date", formatDisplayDate(defaultValue(payload.billDate(), payload.date())), null));
    infoGrid.addCell(infoCard(fonts, "Purchase Date", formatDisplayDate(payload.date()), null));
    infoGrid.addCell(infoCard(fonts, "Items", String.valueOf(items.size()), VIOLET));
    document.add(infoGrid);

    Table itemsTable = createTable(new float[]{0.9f, 5.2f, 1.5f});
    itemsTable.setMarginTop(18f);
    addTableHeader(itemsTable, fonts, List.of("No", "Item Name", "KG"), BLACK, WHITE);
    if (items.isEmpty()) {
      itemsTable.addCell(emptyStateCell(fonts, 3, "No items"));
    } else {
      for (int index = 0; index < items.size(); index++) {
        PurchasePdfPayload.Item item = items.get(index);
        itemsTable.addCell(dataCell(fonts, String.valueOf(index + 1), false, TextAlignment.CENTER, null));
        itemsTable.addCell(dataCell(fonts, item.itemName(), true, TextAlignment.LEFT, null));
        itemsTable.addCell(dataCell(fonts, formatMetric(item.kg()), true, TextAlignment.CENTER, VIOLET));
      }
    }
    document.add(itemsTable);

    document.add(summaryBand(
        fonts,
        VIOLET,
        List.of(
            new SummaryMetric("Items", String.valueOf(items.size())),
            new SummaryMetric("Total KG", formatMetric(sumPurchaseQuantities(items)))
        )
    ));
  }

  private void composeMonthlyReportPdf(
      Document document,
      PdfFontRegistry.PdfFonts fonts,
      MonthlyReportPdfPayload payload
  ) {
    addDocumentHeader(
        document,
        fonts,
        defaultValue(payload.title(), "SMVS MONTHLY STOCK REPORT"),
        "Professional monthly stock summary",
        EMERALD,
        TextAlignment.LEFT
    );

    Table infoGrid = createInfoGrid(3);
    infoGrid.addCell(infoCard(fonts, "Month", payload.monthLabel(), null));
    infoGrid.addCell(infoCard(fonts, "Center", payload.centerLabel(), null));
    infoGrid.addCell(infoCard(fonts, "Range", payload.rangeLabel(), null));
    document.add(infoGrid);

    Table itemsTable = createTable(new float[]{3.8f, 1.7f, 1.7f, 1.9f});
    itemsTable.setMarginTop(18f);
    addTableHeader(
        itemsTable,
        fonts,
        List.of("Item Name", "Income (KG)", "Outgoing (KG)", "Total Stock (KG)"),
        EMERALD,
        WHITE
    );

    List<MonthlyReportPdfPayload.Row> rows = safeList(payload.rows());
    if (rows.isEmpty()) {
      itemsTable.addCell(emptyStateCell(fonts, 4, "No items found for the selected month."));
    } else {
      for (MonthlyReportPdfPayload.Row row : rows) {
        itemsTable.addCell(dataCell(fonts, row.itemName(), true, TextAlignment.LEFT, null));
        itemsTable.addCell(dataCell(fonts, formatMetric(row.income()), true, TextAlignment.CENTER, EMERALD));
        itemsTable.addCell(dataCell(fonts, formatMetric(row.outgoing()), true, TextAlignment.CENTER, null));
        itemsTable.addCell(dataCell(fonts, formatMetric(row.totalStock()), true, TextAlignment.CENTER, null));
      }
    }
    document.add(itemsTable);

    MonthlyReportPdfPayload.Summary summary = payload.summary();
    document.add(summaryBand(
        fonts,
        EMERALD,
        List.of(
            new SummaryMetric("વસ્તુઓની સંખ્યા", formatMetric(summary == null ? null : summary.totalRows())),
            new SummaryMetric("આવક KG", formatMetric(summary == null ? null : summary.totalIncome())),
            new SummaryMetric("જાવક KG", formatMetric(summary == null ? null : summary.totalOutgoing())),
            new SummaryMetric("કુલ સ્ટોક KG", formatMetric(summary == null ? null : summary.totalStock()))
        )
    ));
  }

  private void addDocumentHeader(
      Document document,
      PdfFontRegistry.PdfFonts fonts,
      String title,
      String subtitle,
      Color accent,
      TextAlignment alignment
  ) {
    document.add(
        autoParagraph(title, fonts, 22f, true, accent)
            .setTextAlignment(alignment)
            .setMarginTop(0)
            .setMarginBottom(4f)
    );
    document.add(
        autoParagraph(subtitle, fonts, 9f, true, SLATE_500)
            .setTextAlignment(alignment)
            .setMarginTop(0)
            .setMarginBottom(10f)
    );

    Div accentRule = new Div()
        .setHeight(3f)
        .setBackgroundColor(accent)
        .setWidth(UnitValue.createPercentValue(100))
        .setMarginTop(0)
        .setMarginBottom(18f);
    document.add(accentRule);
  }

  private Table createInfoGrid(int columns) {
    float[] widths = new float[columns];
    for (int index = 0; index < columns; index++) {
      widths[index] = 1f;
    }
    Table table = createTable(widths);
    table.setBackgroundColor(GRAY_100);
    table.setBorder(new SolidBorder(GRAY_200, 1f));
    table.setMarginBottom(4f);
    return table;
  }

  private Table createTable(float[] widths) {
    return new Table(UnitValue.createPercentArray(widths))
        .useAllAvailableWidth()
        .setMarginTop(0)
        .setMarginBottom(0);
  }

  private Cell infoCard(
      PdfFontRegistry.PdfFonts fonts,
      String label,
      String value,
      Color valueColor
  ) {
    Cell cell = new Cell()
        .setBorder(Border.NO_BORDER)
        .setPaddingTop(10f)
        .setPaddingBottom(10f)
        .setPaddingLeft(12f)
        .setPaddingRight(12f);

    cell.add(
        autoParagraph(label == null ? "-" : label.toUpperCase(), fonts, 8f, true, SLATE_400)
            .setMarginBottom(5f)
    );
    cell.add(
        autoParagraph(defaultValue(value, "-"), fonts, 11.5f, true, valueColor == null ? BLACK : valueColor)
    );
    return cell;
  }

  private void addTableHeader(
      Table table,
      PdfFontRegistry.PdfFonts fonts,
      List<String> headers,
      Color fillColor,
      Color textColor
  ) {
    for (String header : headers) {
      Cell cell = new Cell()
          .setBackgroundColor(fillColor)
          .setBorder(new SolidBorder(BLACK, 0.8f))
          .setPaddingTop(8f)
          .setPaddingBottom(8f)
          .setPaddingLeft(8f)
          .setPaddingRight(8f);
      cell.add(autoParagraph(header, fonts, 9f, true, textColor).setTextAlignment(TextAlignment.CENTER));
      table.addHeaderCell(cell);
    }
  }

  private Cell dataCell(
      PdfFontRegistry.PdfFonts fonts,
      String value,
      boolean bold,
      TextAlignment alignment,
      Color color
  ) {
    Cell cell = new Cell()
        .setBorder(new SolidBorder(GRAY_200, 0.8f))
        .setPaddingTop(7f)
        .setPaddingBottom(7f)
        .setPaddingLeft(8f)
        .setPaddingRight(8f);
    cell.add(autoParagraph(defaultValue(value, "-"), fonts, 10f, bold, color == null ? BLACK : color)
        .setTextAlignment(alignment));
    return cell;
  }

  private Cell emptyStateCell(PdfFontRegistry.PdfFonts fonts, int columnSpan, String message) {
    Cell cell = new Cell(1, columnSpan)
        .setBorder(new SolidBorder(GRAY_200, 0.8f))
        .setPadding(18f);
    cell.add(autoParagraph(message, fonts, 10f, true, SLATE_400).setTextAlignment(TextAlignment.CENTER));
    return cell;
  }

  private Table summaryBand(
      PdfFontRegistry.PdfFonts fonts,
      Color accent,
      List<SummaryMetric> metrics
  ) {
    float[] widths = new float[metrics.size()];
    for (int index = 0; index < metrics.size(); index++) {
      widths[index] = 1f;
    }

    Table table = createTable(widths)
        .setMarginTop(18f)
        .setBorder(new SolidBorder(BLACK, 1.5f))
        .setHorizontalAlignment(HorizontalAlignment.CENTER);

    for (SummaryMetric metric : metrics) {
      Cell cell = new Cell()
          .setBorder(Border.NO_BORDER)
          .setPaddingTop(12f)
          .setPaddingBottom(12f)
          .setPaddingLeft(10f)
          .setPaddingRight(10f);
      cell.add(autoParagraph(metric.label(), fonts, 8.5f, true, accent).setTextAlignment(TextAlignment.CENTER));
      cell.add(autoParagraph(metric.value(), fonts, 11f, true, BLACK)
          .setTextAlignment(TextAlignment.CENTER)
          .setMarginTop(3f));
      table.addCell(cell);
    }
    return table;
  }

  private Paragraph autoParagraph(
      String value,
      PdfFontRegistry.PdfFonts fonts,
      float fontSize,
      boolean bold,
      Color color
  ) {
    Paragraph paragraph = new Paragraph()
        .setMargin(0)
        .setMultipliedLeading(1.15f)
        .setFontSize(fontSize)
        .setFontColor(color);

    for (TextRun run : splitRuns(defaultValue(value, "-"))) {
      paragraph.add(new Text(run.text()).setFont(resolveFont(run.script(), fonts, bold)));
    }
    return paragraph;
  }

  private PdfFont resolveFont(Script script, PdfFontRegistry.PdfFonts fonts, boolean bold) {
    if (script == Script.GUJARATI) {
      return bold ? fonts.gujaratiBold() : fonts.gujaratiRegular();
    }
    return bold ? fonts.latinBold() : fonts.latinRegular();
  }

  private List<TextRun> splitRuns(String value) {
    List<TextRun> runs = new ArrayList<>();
    if (!hasText(value)) {
      runs.add(new TextRun("-", Script.LATIN));
      return runs;
    }

    StringBuilder buffer = new StringBuilder();
    Script currentScript = Script.LATIN;
    boolean initialized = false;

    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      Script nextScript = classifyScript(character);
      if (nextScript == Script.NEUTRAL) {
        nextScript = initialized ? currentScript : Script.LATIN;
      }

      if (!initialized) {
        currentScript = nextScript;
        initialized = true;
      }

      if (nextScript != currentScript) {
        runs.add(new TextRun(buffer.toString(), currentScript));
        buffer.setLength(0);
        currentScript = nextScript;
      }

      buffer.append(character);
    }

    if (buffer.length() > 0) {
      runs.add(new TextRun(buffer.toString(), currentScript));
    }

    return runs;
  }

  private Script classifyScript(char character) {
    if (character >= 0x0A80 && character <= 0x0AFF) {
      return Script.GUJARATI;
    }
    if (Character.UnicodeScript.of(character) == Character.UnicodeScript.LATIN) {
      return Script.LATIN;
    }
    return Script.NEUTRAL;
  }

  private BigDecimal sumRequestQuantities(List<RequestPdfPayload.Item> items) {
    return items.stream()
        .map(item -> item.qty() == null ? BigDecimal.ZERO : item.qty())
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private BigDecimal sumDispatchQuantities(List<DispatchPdfPayload.Item> items) {
    return items.stream()
        .map(item -> item.kg() == null ? BigDecimal.ZERO : item.kg())
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private BigDecimal sumPurchaseQuantities(List<PurchasePdfPayload.Item> items) {
    return items.stream()
        .map(item -> item.kg() == null ? BigDecimal.ZERO : item.kg())
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private <T> List<T> safeList(List<T> values) {
    return values == null ? List.of() : values;
  }

  private boolean hasText(String value) {
    return value != null && !value.trim().isEmpty();
  }

  private String defaultValue(String value, String fallback) {
    return hasText(value) ? value.trim() : fallback;
  }

  private String safeText(String value) {
    return defaultValue(value, "-");
  }

  private String valueWithPrefix(String prefix, String value) {
    return hasText(value) ? prefix + value.trim() : "-";
  }

  private String formatDisplayDate(String value) {
    if (!hasText(value)) {
      return "-";
    }

    String trimmed = value.trim();
    if (trimmed.matches("\\d{4}-\\d{2}-\\d{2}")) {
      String[] pieces = trimmed.split("-");
      return pieces[2] + "-" + pieces[1] + "-" + pieces[0];
    }
    return trimmed;
  }

  private String formatMetric(BigDecimal value) {
    if (value == null) {
      return "0";
    }
    BigDecimal normalized = value.stripTrailingZeros();
    if (normalized.scale() < 0) {
      normalized = normalized.setScale(0, RoundingMode.UNNECESSARY);
    }
    return normalized.toPlainString();
  }

  @FunctionalInterface
  private interface PdfComposer {
    void compose(Document document, PdfDocument pdfDocument, PdfFontRegistry.PdfFonts fonts);
  }

  private record SummaryMetric(String label, String value) {
  }

  private record TextRun(String text, Script script) {
  }

  private enum Script {
    LATIN,
    GUJARATI,
    NEUTRAL
  }

  private static final class FooterEventHandler extends AbstractPdfDocumentEventHandler {

    private final PdfFont font;

    private FooterEventHandler(PdfFont font) {
      this.font = font;
    }

    @Override
    protected void onAcceptedEvent(AbstractPdfDocumentEvent event) {
      PdfDocumentEvent documentEvent = (PdfDocumentEvent) event;
      PdfPage page = documentEvent.getPage();
      PdfDocument pdfDocument = page.getDocument();
      Rectangle pageSize = page.getPageSize();
      int pageNumber = pdfDocument.getPageNumber(page);

      PdfCanvas pdfCanvas = new PdfCanvas(page.newContentStreamAfter(), page.getResources(), pdfDocument);
      Canvas canvas = new Canvas(pdfCanvas, pageSize);
      canvas.showTextAligned(
          new Paragraph("Page " + pageNumber)
              .setFont(font)
              .setFontSize(8f)
              .setFontColor(SLATE_500),
          pageSize.getRight() - 26,
          pageSize.getBottom() + 16,
          TextAlignment.RIGHT
      );
      canvas.close();
    }
  }
}
