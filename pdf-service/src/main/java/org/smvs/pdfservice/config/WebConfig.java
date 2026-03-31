package org.smvs.pdfservice.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

  private final String[] allowedOrigins;

  public WebConfig(@Value("${smvs.pdf.allowed-origins:*}") String allowedOrigins) {
    this.allowedOrigins = allowedOrigins.split("\\s*,\\s*");
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/api/pdfs/**")
        .allowedOriginPatterns(allowedOrigins)
        .allowedMethods("POST", "OPTIONS")
        .allowedHeaders("*");
  }
}
