package org.smvs.pdfservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MonthlyReportPdfPayload(
    String id,
    String title,
    String month,
    String monthLabel,
    String selectedDate,
    String scope,
    String center,
    String centerLabel,
    String rangeLabel,
    String generatedAtIso,
    String createdBy,
    String email,
    Summary summary,
    List<Row> rows
) {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Summary(
      BigDecimal totalRows,
      BigDecimal totalIncome,
      BigDecimal totalOutgoing,
      BigDecimal totalStock
  ) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Row(
      String itemName,
      String monthLabel,
      BigDecimal income,
      BigDecimal outgoing,
      BigDecimal totalStock
  ) {
  }
}
