package io.math24.game.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/** Exercises the real CORS boundary without starting the database or game services. */
@SpringJUnitWebConfig(GameApiCorsTest.MvcTestConfiguration.class)
@TestPropertySource(properties = "math24.api.allowed-origins=https://math24.example.test")
class GameApiCorsTest {
    private static final String FRONTEND_ORIGIN = "https://math24.example.test";
    private static final String API_ORIGIN = "https://math24-api.azure.example.test";
    private static final String API_URL = API_ORIGIN + ":443/api/v1/cors-probe";
    private static final String AUTHORIZATION = "Bearer test-guest";
    private static final String BODY = "{\"message\":\"ready\"}";
    private static final String RESPONSE = "{\"message\":\"ready\",\"authorizationReceived\":true}";

    @Autowired
    private WebApplicationContext context;

    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"POST", "PUT"})
    void acceptsTheFrontendOriginWhenTheApiHostIsDifferent(String method) throws Exception {
        mvc.perform(jsonRequest(request(HttpMethod.valueOf(method), API_URL))
                        .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS))
                .andExpect(content().json(RESPONSE));
    }

    @Test
    void rejectsAnUnlistedOriginEvenWhenItClaimsToBeTheForwardedHost() throws Exception {
        mvc.perform(jsonRequest(post(API_URL))
                        .header(HttpHeaders.ORIGIN, "https://untrusted.example.test")
                        .header("X-Forwarded-Host", "untrusted.example.test")
                        .header("X-Forwarded-Proto", "https")
                        .header("X-Forwarded-Port", "443"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void permitsTheBearerAndJsonPreflightWithoutEnablingCookieCredentials() throws Exception {
        mvc.perform(options(API_URL)
                        .header(HttpHeaders.ORIGIN, FRONTEND_ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "PUT")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization, Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND_ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, "Authorization, Content-Type"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void acceptsRequestsWithoutAnOriginOrFromTheApiOrigin(boolean includeOrigin) throws Exception {
        MockHttpServletRequestBuilder request = jsonRequest(post(API_URL));
        if (includeOrigin) {
            request.header(HttpHeaders.ORIGIN, API_ORIGIN);
        }
        mvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .andExpect(content().json(RESPONSE));
    }

    private static MockHttpServletRequestBuilder jsonRequest(MockHttpServletRequestBuilder request) {
        return request.header(HttpHeaders.AUTHORIZATION, AUTHORIZATION)
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY);
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableWebMvc
    @Import(GameApiWebConfiguration.class)
    static class MvcTestConfiguration {
        @Bean
        ProbeController probeController() {
            return new ProbeController();
        }
    }

    @TestComponent
    @RestController
    static class ProbeController {
        @RequestMapping(path = "/api/v1/cors-probe", method = {RequestMethod.POST, RequestMethod.PUT})
        Map<String, Object> echo(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                @RequestBody Map<String, String> body) {
            return Map.of("message", body.get("message"),
                    "authorizationReceived", AUTHORIZATION.equals(authorization));
        }
    }
}
