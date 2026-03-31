package org.smvs.pdfservice.service;

import com.itextpdf.io.font.PdfEncodings;
import com.itextpdf.io.font.constants.StandardFonts;
import com.itextpdf.kernel.font.PdfFont;
import com.itextpdf.kernel.font.PdfFontFactory;
import com.itextpdf.kernel.pdf.PdfDocument;
import java.io.IOException;
import java.io.InputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

@Component
public class PdfFontRegistry {

  private final byte[] gujaratiRegularBytes;
  private final byte[] gujaratiBoldBytes;

  public PdfFontRegistry(
      @Value("classpath:fonts/NotoSansGujarati-Regular.ttf") Resource gujaratiRegular,
      @Value("classpath:fonts/NotoSansGujarati-Bold.ttf") Resource gujaratiBold
  ) throws IOException {
    this.gujaratiRegularBytes = readAllBytes(gujaratiRegular);
    this.gujaratiBoldBytes = readAllBytes(gujaratiBold);
  }

  public PdfFonts createFonts(PdfDocument ignoredPdfDocument) {
    try {
      return new PdfFonts(
          PdfFontFactory.createFont(StandardFonts.HELVETICA),
          PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD),
          PdfFontFactory.createFont(
              gujaratiRegularBytes,
              PdfEncodings.IDENTITY_H,
              PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED
          ),
          PdfFontFactory.createFont(
              gujaratiBoldBytes,
              PdfEncodings.IDENTITY_H,
              PdfFontFactory.EmbeddingStrategy.PREFER_EMBEDDED
          )
      );
    } catch (IOException exception) {
      throw new IllegalStateException("Unable to initialize embedded Gujarati fonts.", exception);
    }
  }

  private static byte[] readAllBytes(Resource resource) throws IOException {
    try (InputStream inputStream = resource.getInputStream()) {
      return inputStream.readAllBytes();
    }
  }

  public record PdfFonts(
      PdfFont latinRegular,
      PdfFont latinBold,
      PdfFont gujaratiRegular,
      PdfFont gujaratiBold
  ) {
  }
}
