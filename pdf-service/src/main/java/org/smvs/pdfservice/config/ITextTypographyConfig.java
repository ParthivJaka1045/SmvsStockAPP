package org.smvs.pdfservice.config;

import com.itextpdf.commons.actions.processors.ITextProductEventProcessor;
import com.itextpdf.commons.actions.processors.UnderAgplITextProductEventProcessor;
import com.itextpdf.typography.actions.data.PdfCalligraphProductData;
import com.itextpdf.typography.shaping.TypographyApplier;
import jakarta.annotation.PostConstruct;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ITextTypographyConfig {

  @PostConstruct
  public void registerPdfCalligraph() {
    try {
      TypographyApplier.registerForLayout();

      Class<?> productEventHandlerClass = Class.forName("com.itextpdf.commons.actions.ProductEventHandler");
      Field instanceField = productEventHandlerClass.getDeclaredField("INSTANCE");
      instanceField.setAccessible(true);
      Object handler = instanceField.get(null);

      Method addProcessorMethod = productEventHandlerClass.getDeclaredMethod(
          "addProcessor",
          ITextProductEventProcessor.class
      );
      addProcessorMethod.setAccessible(true);
      addProcessorMethod.invoke(
          handler,
          new UnderAgplITextProductEventProcessor(PdfCalligraphProductData.PDF_CALLIGRAPH_PRODUCT_NAME)
      );
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to register pdfCalligraph typography support.", exception);
    }
  }
}
