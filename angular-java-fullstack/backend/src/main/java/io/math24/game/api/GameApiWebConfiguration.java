package io.math24.game.api;

import java.net.URI;
import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Browser origins are explicit deployment configuration; no credential cookies are used. */
@Configuration(proxyBeanMethods = false)
public class GameApiWebConfiguration implements WebMvcConfigurer {
    private final String[] allowedOrigins;

    public GameApiWebConfiguration(@Value("${math24.api.allowed-origins:}") String configuredOrigins) {
        allowedOrigins = Arrays.stream(configuredOrigins.split(","))
                .map(String::strip)
                .filter(origin -> !origin.isEmpty())
                .distinct()
                .toArray(String[]::new);
        for (String origin : allowedOrigins) {
            validateOrigin(origin);
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.length == 0) {
            return;
        }
        registry.addMapping("/api/v1/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "PUT", "POST", "OPTIONS")
                .allowedHeaders(HttpHeaders.AUTHORIZATION, HttpHeaders.CONTENT_TYPE)
                .exposedHeaders(HttpHeaders.LOCATION)
                .allowCredentials(false)
                .maxAge(3600);
    }

    private static void validateOrigin(String origin) {
        URI uri;
        try {
            uri = URI.create(origin);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Allowed origins must be exact HTTP or HTTPS origins.");
        }
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null
                || (uri.getRawPath() != null && !uri.getRawPath().isEmpty())
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("Allowed origins must be exact HTTP or HTTPS origins without paths.");
        }
    }
}
