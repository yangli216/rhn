package com.rhn.platform.numbering.application;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(BusinessNumberingProperties.class)
public class BusinessNumberingConfiguration {}
