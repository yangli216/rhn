package com.rhn.platform.realtime.application;

public interface PresenceChangePublisher {
    void publish(PresenceChanged change);
}
