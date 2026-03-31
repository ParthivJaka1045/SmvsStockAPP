package org.smvs.pdfservice.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PurchasePdfPayload(
    String center,
    String shopName,
    String billNo,
    String billDate,
    String date,
    List<Item> items
) {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record Item(
      String itemName,
      BigDecimal kg
  ) {
  }
}
