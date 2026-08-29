package com.rhn.platform.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.HeaderParameter;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
class RhnOpenApiConfiguration {
    private static final String EXTERNAL_ID_PATTERN = "^[1-9][0-9]{0,18}$";

    static {
        SpringDocUtils.getConfig().replaceWithSchema(Long.class,
                new StringSchema().pattern(EXTERNAL_ID_PATTERN).example("824633720832983041"));
    }

    @Bean
    OpenAPI rhnOpenApi() {
        return new OpenAPI()
                .info(new Info().title("RHN Application API").version("1.24.0")
                        .description("健域智枢模块化单体正式接口契约"))
                .servers(List.of(new Server().url("/").description("当前部署地址")))
                .components(new Components().addSecuritySchemes("basicAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP).scheme("basic")))
                .addSecurityItem(new SecurityRequirement().addList("basicAuth"));
    }

    @Bean
    OpenApiCustomizer rhnContextHeaders() {
        return openApi -> openApi.getPaths().forEach((path, pathItem) -> {
            if (!path.startsWith("/api/")) return;
            pathItem.readOperations().forEach(operation -> {
                operation.addParametersItem(new HeaderParameter().name("X-Tenant-Id").required(true)
                        .description("当前县域医共体租户标识")
                        .schema(new StringSchema().pattern(EXTERNAL_ID_PATTERN)));
                operation.addParametersItem(new HeaderParameter().name("X-Correlation-Id").required(false)
                        .description("调用链关联号；未提供时由服务端生成")
                        .schema(new StringSchema().maxLength(64)));
                operation.addParametersItem(new HeaderParameter().name("X-Organization-Id").required(false)
                        .description("当前受信工作机构；任务、通知和门户聚合接口必须提供")
                        .schema(new StringSchema().pattern(EXTERNAL_ID_PATTERN)));
                operation.addParametersItem(new HeaderParameter().name("X-Department-Id").required(false)
                        .description("当前受信工作科室；必须属于当前机构且在用户有效授权范围内")
                        .schema(new StringSchema().pattern(EXTERNAL_ID_PATTERN)));
            });
        });
    }
}
