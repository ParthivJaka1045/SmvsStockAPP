package org.smvs.pdfservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record DispatchPdfPayload(
    String fromCenter,
    String toCenter,
    String chalanNo,
    String date,
    String senderName,
    String mobileNumber,
    String globalId,
    String email,
    List<Item> items
) {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Item(
      String itemName,
      BigDecimal kg
  ) {
  }
}
