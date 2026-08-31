package com.rhn.platform.realtime.application;

public interface PresenceControlPublisher {
    void publish(PresenceControlCommand command);
}
