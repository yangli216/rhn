package com.rhn.billing.application.reconciliation;

import com.rhn.billing.domain.ReconciliationAction;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.cryptography.api.SecretEncryptionService;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import static com.rhn.billing.api.PaymentReconciliation.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class ReconciliationExportService {
 private final ReconciliationAccess access;private final ReconciliationReadService reads;private final ReconciliationItemRepository items;private final ReconciliationStatementFileRepository files;private final ReconciliationActionRepository actions;private final SecretEncryptionService encryption;private final JsonCodec json;
 public ReconciliationExportService(ReconciliationAccess access,ReconciliationReadService reads,ReconciliationItemRepository items,ReconciliationStatementFileRepository files,ReconciliationActionRepository actions,SecretEncryptionService encryption,JsonCodec json){this.access=access;this.reads=reads;this.items=items;this.files=files;this.actions=actions;this.encryption=encryption;this.json=json;}
 @Transactional
 public byte[] csv(Long batchId){var c=access.require(EXPORT);var batch=reads.requireBatch(batchId);var text=new StringBuilder("\uFEFF明细ID,支付指令ID,交易类型,匹配结果,处置状态,本地金额,渠道行金额,差额,币种,处置说明\r\n");int page=0;
  while(true){var result=items.findByTenantIdAndReconciliationBatchIdOrderById(c.tenantId(),batchId,PageRequest.of(page++,500));for(var i:result){text.append(csv("'"+i.id())).append(',').append(csv(i.paymentOrderId()==null?"":"'"+i.paymentOrderId())).append(',').append(csv(i.transactionType())).append(',').append(csv(i.matchType())).append(',').append(csv(i.status())).append(',').append(i.localAmount().toPlainString()).append(',').append(i.externalAmount().toPlainString()).append(',').append(i.differenceAmount().toPlainString()).append(',').append(csv(i.currencyCode())).append(',').append(csv(i.resolution())).append("\r\n");}if(text.length()>16*1024*1024)throw conflict("RECON_EXPORT_LIMIT","导出超出16 MiB限制，请缩小范围");if(!result.hasNext())break;}
  byte[] output=text.toString().getBytes(StandardCharsets.UTF_8);if(output.length>16*1024*1024)throw conflict("RECON_EXPORT_LIMIT","导出超出16 MiB限制，请缩小范围");String command="EXPORT-"+GlobalIds.next();actions.save(new ReconciliationAction(c.tenantId(),command,ReconciliationFingerprints.hash(command),"EXPORT",batch.id(),c.subjectId(),"机构版本差异导出"));return output;
 }
 @Transactional
 public byte[] evidence(Long taskId,Long fileId){var c=access.require(EXPORT);access.requireMerchant(c);reads.get(taskId);var file=files.findByIdAndTenantId(fileId,c.tenantId()).filter(f->f.taskId().equals(taskId)).orElseThrow(()->notFound("RECON_FILE_NOT_FOUND","未找到完整账单证据"));
  var values=json.readObject(encryption.decrypt(file.encryptedFiles(),ReconciliationRunService.binding(c.tenantId(),fileId)));
  try{var bytes=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(bytes,StandardCharsets.UTF_8)){for(var entry:values.entrySet()){String name=entry.getKey();if(name.contains("..")||name.startsWith("/")||name.contains("\\")||!(entry.getValue() instanceof String value))throw conflict("RECON_FILE_INVALID","账单证据格式无效");zip.putNextEntry(new ZipEntry(name));zip.write(Base64.getDecoder().decode(value));zip.closeEntry();}}
   String command="EXPORT-RAW-"+GlobalIds.next();actions.save(new ReconciliationAction(c.tenantId(),command,ReconciliationFingerprints.hash(command),"EXPORT_RAW",fileId,c.subjectId(),"商户全账证据导出"));return bytes.toByteArray();
  }catch(IOException e){throw conflict("RECON_EXPORT_FAILED","账单证据导出失败");}
 }
 private String csv(String s){String v=s==null?"":s;if(!v.stripLeading().isEmpty()&&"=+-@".indexOf(v.stripLeading().charAt(0))>=0)v="'"+v;return '"'+v.replace("\"","\"\"")+'"';}
}
