package com.rhn;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class RhnApplication {
    public static void main(String[] args) {
        SpringApplication.run(RhnApplication.class, args);
    }
}
