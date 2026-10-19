package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentReconciliation.StatementProtocolException;
import java.net.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static com.rhn.billing.infrastructure.payment.StatementCsv.*;

/** Fixed official HTTPS hosts, no redirects, bounded response bytes and a whole-transfer deadline. */
final class StatementHttpDownload {
 private static final Set<String> ALIPAY_HOSTS=Set.of("dwbillcenter.alipay.com","dwbillcenter-dl.alipay.com");
 private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
 byte[] alipay(String address){
  CompletableFuture<HttpResponse<byte[]>> transfer=null;
  try{
   URI uri=URI.create(address);
   if(!"https".equals(uri.getScheme())||!ALIPAY_HOSTS.contains(uri.getHost())||uri.getUserInfo()!=null||uri.getPort()!=-1&&uri.getPort()!=443)throw invalid("支付宝账单下载地址不在允许范围");
   for(var ip:InetAddress.getAllByName(uri.getHost()))if(ip.isAnyLocalAddress()||ip.isLoopbackAddress()||ip.isLinkLocalAddress()||ip.isSiteLocalAddress()||ip.isMulticastAddress())throw invalid("账单下载地址解析无效");
   var request=HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30)).GET().build();
   transfer=client.sendAsync(request,info->new BoundedBody());var response=transfer.get(30,TimeUnit.SECONDS);
   if(response.statusCode()!=200)throw invalid("支付宝账单下载未成功，请重新申请下载");return response.body();
  }catch(InterruptedException e){Thread.currentThread().interrupt();throw invalid("账单下载被中断");}
  catch(StatementProtocolException e){throw e;}
  catch(Exception e){throw invalid("账单下载失败或超过传输时限，请重试或检查网络");}
  finally{if(transfer!=null&&!transfer.isDone())transfer.cancel(true);}
 }
 private static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
  private final CompletableFuture<byte[]> body=new CompletableFuture<>();private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();private Flow.Subscription subscription;
  public CompletionStage<byte[]>getBody(){return body;}
  public void onSubscribe(Flow.Subscription value){subscription=value;value.request(1);}
  public void onNext(List<ByteBuffer> chunks){for(var chunk:chunks){if((long)bytes.size()+chunk.remaining()>MAX_BYTES){subscription.cancel();body.completeExceptionally(invalid("账单超过16 MiB接入上限"));return;}var data=new byte[chunk.remaining()];chunk.get(data);bytes.writeBytes(data);}subscription.request(1);}
  public void onError(Throwable error){body.completeExceptionally(error);}
  public void onComplete(){body.complete(bytes.toByteArray());}
 }
}
