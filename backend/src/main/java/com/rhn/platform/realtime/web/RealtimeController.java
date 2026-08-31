package com.rhn.platform.realtime.web;

import com.rhn.platform.realtime.application.RealtimeConnectionRegistry;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/realtime")
public class RealtimeController {
    private final RealtimeConnectionRegistry registry;
    private final ExecutionContextProvider contextProvider;

    public RealtimeController(RealtimeConnectionRegistry registry, ExecutionContextProvider contextProvider) {
        this.registry = registry;
        this.contextProvider = contextProvider;
    }

    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter events(@RequestHeader("X-Client-Session-Id") String clientSessionId) {
        return registry.connect(contextProvider.requireCurrent(), clientSessionId);
    }
}
