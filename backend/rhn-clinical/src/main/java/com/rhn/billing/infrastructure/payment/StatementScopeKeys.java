package com.rhn.billing.infrastructure.payment;
final class StatementScopeKeys {
 private StatementScopeKeys(){}
 static String of(String adapter,String environment,String merchant){try{return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((adapter+"\n"+environment+"\n"+merchant).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}
