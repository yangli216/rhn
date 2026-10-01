package com.rhn.ai.infrastructure;

import com.rhn.ai.application.DecisionModelGateway;
import com.rhn.ai.application.DecisionModelSettings;
import com.rhn.ai.application.ClinicalAiMetrics;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
public class JevDecisionModelGateway implements DecisionModelGateway {
    private final JsonCodec json;
    private final ClinicalAiMetrics metrics;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    public JevDecisionModelGateway(JsonCodec json, ClinicalAiMetrics metrics) { this.json = json; this.metrics = metrics; }

    public Result decide(Request input, DecisionModelSettings settings) {
        if (!settings.ready()) throw badRequest("DECISION_NOT_READY", "决策模型地址、模型或独立 API Key 未配置完整。");
        var questions = new LinkedHashMap<String, Object>();
        for (var question : input.questions()) {
            if (question.criteria().size() < 2 || question.criteria().size() > 255
                    || questions.containsKey(question.id())) throw badRequest("DECISION_INPUT_INVALID", "决策问题或候选数量不合法。");
            questions.put(question.id(), Map.of("type", "choice", "instructions", question.instructions(), "criteria", question.criteria()));
        }
        if (questions.isEmpty()) throw badRequest("DECISION_INPUT_INVALID", "决策问题不能为空。");
        String traceId = com.rhn.shared.id.GlobalIds.external(com.rhn.shared.id.GlobalIds.next());
        var request = HttpRequest.newBuilder(settings.endpoint()).timeout(settings.timeout())
                .header("Content-Type", "application/json").header("Authorization", "Bearer " + settings.apiKey())
                .header("X-RHN-Decision-Version", input.version())
                .POST(HttpRequest.BodyPublishers.ofString(json.write(Map.of("model", settings.model(),
                        "state", input.state(), "questions", questions)))).build();
        long start = System.nanoTime();
        String outcome = "FAILED";
        try {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw badRequest("DECISION_PROVIDER_FAILED", "决策服务调用失败（HTTP " + response.statusCode() + "）。");
            var root = json.readStrictTree(response.body());
            if (!root.path("answers").isObject() || root.path("answers").size() != input.questions().size()) throw invalidOutput();
            var answers = new LinkedHashMap<String, ChoiceAnswer>();
            for (var question : input.questions()) {
                var answer = root.path("answers").path(question.id());
                String choice = answer.path("choice").asString("");
                double confidence = answer.path("confidence").asDouble(-1);
                var distribution = answer.path("probabilities");
                if (!"choice".equals(answer.path("type").asString()) || !question.criteria().containsKey(choice)
                        || !answer.path("confidence").isNumber() || !probability(confidence)
                        || !distribution.isObject() || distribution.size() != question.criteria().size())
                    throw invalidOutput();
                var probabilities = new LinkedHashMap<String, Double>();
                for (String key : question.criteria().keySet()) {
                    var node = distribution.path(key);
                    double value = node.asDouble(-1);
                    if (!node.isNumber() || !probability(value)) throw invalidOutput();
                    probabilities.put(key, value);
                }
                double sum = probabilities.values().stream().mapToDouble(Double::doubleValue).sum();
                double max = probabilities.values().stream().mapToDouble(Double::doubleValue).max().orElse(0);
                if (Math.abs(sum - 1) > 0.01 || probabilities.get(choice) + 0.000001 < max) throw invalidOutput();
                answers.put(question.id(), new ChoiceAnswer(choice, probabilities, confidence));
            }
            String model = root.path("model").asString("");
            if (model.isBlank() || model.length() > 200) throw invalidOutput();
            outcome = "COMPLETED";
            metrics.recordProviderTokens("jev", model, "input", root.path("usage").path("input_tokens").asLong(-1));
            return new Result(traceId, model, answers, (System.nanoTime() - start) / 1_000_000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw badRequest("DECISION_INTERRUPTED", "决策模型请求已中断。");
        } catch (java.io.IOException e) {
            throw badRequest("DECISION_CONNECTION", "决策模型连接失败或超时。");
        } finally {
            metrics.recordProviderRequest("jev", settings.model(), input.version(), "CHOICE", outcome, System.nanoTime() - start);
        }
    }

    private static boolean probability(double value) { return Double.isFinite(value) && value >= 0 && value <= 1; }
    private static RuntimeException invalidOutput() { return badRequest("DECISION_OUTPUT_INVALID", "决策模型返回格式或候选不合法。"); }
}
