package com.rhn.shared.context;

public interface ExecutionContextProvider {
    ExecutionContext requireCurrent();
}
