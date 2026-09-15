package com.rhn.ai.application;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import java.net.http.*;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class StructuredAiService implements StructuredAiDirectory {
    private final ClinicalAiRuntimePolicy policy;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(10)).build();
    public StructuredAiService(ClinicalAiRuntimePolicy policy, ExecutionContextProvider contexts, JsonCodec json) {
        this.policy=policy; this.contexts=contexts; this.json=json;
    }
    public Status status() {
        var context=contexts.requireCurrent(); var settings=policy.current(context);
        boolean available=settings.mode()==ClinicalAssistantSettings.Mode.MODEL && settings.availableFor(context);
        return new Status(available, available?settings.model():null, available?"已配置真实 AI 模型，点击解析时调用":"AI 尚未就绪，请在 AI助理配置中启用模型服务；也可手动配置分析条件。");
    }
    public String complete(String systemPrompt, String input) {
        var context=contexts.requireCurrent(); var settings=policy.current(context);
        if(settings.mode()!=ClinicalAssistantSettings.Mode.MODEL || !settings.availableFor(context))
            throw badRequest("ANALYTICS_AI_UNAVAILABLE", "AI 尚未就绪，请在 AI助理配置中启用模型服务，或手动配置分析条件。");
        Map<String,Object> body=new LinkedHashMap<>();
        body.put("model",settings.model()); body.put("temperature",0.1); body.put("max_tokens",Math.min(3200,settings.maxOutputTokens()));
        body.put("response_format",Map.of("type","json_object"));
        body.put("messages",List.of(Map.of("role","system","content",systemPrompt),Map.of("role","user","content",input)));
        ClinicalAiRequestOptions.applyNonThinkingDefault(body,settings.endpoint(),settings.model());
        var request=HttpRequest.newBuilder(settings.endpoint()).timeout(settings.requestTimeout())
                .header("Content-Type","application/json").header("X-RHN-Prompt-Version","RHN-ANALYTICS-V1")
                .POST(HttpRequest.BodyPublishers.ofString(json.write(body)));
        if(settings.apiKey()!=null) request.header("Authorization","Bearer "+settings.apiKey());
        try {
            var response=client.send(request.build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()<200 || response.statusCode()>=300)
                throw badRequest("ANALYTICS_AI_PROVIDER", "AI 服务调用失败（HTTP "+response.statusCode()+"），请检查模型配置后重试。");
            var choice=json.readTree(response.body()).path("choices").path(0);
            if("length".equals(choice.path("finish_reason").asString()))
                throw badRequest("ANALYTICS_AI_OUTPUT", "AI 输出不完整，请缩短需求后重试。");
            String content=choice.path("message").path("content").asString("").trim();
            if(content.isBlank()) throw badRequest("ANALYTICS_AI_OUTPUT", "AI 未返回分析条件，请重试。");
            return content.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "").trim();
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt(); throw badRequest("ANALYTICS_AI_INTERRUPTED", "AI 解析已中断，请重试。");
        } catch(java.io.IOException e) { throw badRequest("ANALYTICS_AI_CONNECTION", "AI 服务连接失败或超时，请重试或手动配置条件。"); }
    }
}
