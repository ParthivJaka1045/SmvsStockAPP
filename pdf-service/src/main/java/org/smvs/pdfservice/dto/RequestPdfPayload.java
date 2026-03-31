package org.smvs.pdfservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RequestPdfPayload(
    String center,
    String chalanNo,
    String date,
    String senderName,
    String post,
    String mobileNumber,
    String globalId,
    String email,
    List<Item> items
) {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Item(
      String name,
      String category,
      String unit,
      BigDecimal qty
  ) {
  }
}
