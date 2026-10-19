package com.rhn.billing.infrastructure.payment;

import com.rhn.billing.api.PaymentReconciliation.*;
import java.io.*;
import java.math.*;
import java.nio.charset.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.*;

/** Strict bounded CSV/ZIP reader. Unknown formats fail closed; neither payer data nor paths are retained. */
final class StatementCsv {
    static final int MAX_BYTES = 16 * 1024 * 1024;
    static final int MAX_ROWS = 100000;
    private StatementCsv() {}
    static List<StatementFile> unpack(String name, byte[] bytes) {
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw invalid("账单文件为空或超过16 MiB接入上限");
        if (bytes.length < 4 || bytes[0] != 'P' || bytes[1] != 'K') return List.of(new StatementFile(name,bytes));
        var result = new ArrayList<StatementFile>(); int total = 0;
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes), Charset.forName("GB18030"))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String path = entry.getName();
                if (entry.isDirectory()) continue;
                if (path.startsWith("/") || path.contains("..") || path.contains("\\") || path.matches(".*[\\x00-\\x1F\\x7F:].*") || path.length()>200 || !path.toLowerCase(Locale.ROOT).endsWith(".csv") || result.size() >= 8)
                    throw invalid("账单压缩包文件集合无效");
                byte[] content = zip.readNBytes(MAX_BYTES - total + 1); total += content.length;
                if (total > MAX_BYTES || bytes.length * 100L < total) throw invalid("账单解压大小或压缩比例超限");
                if (result.stream().anyMatch(f -> f.name().equals(path))) throw invalid("账单压缩包存在重复文件");
                result.add(new StatementFile(path,content));
            }
        } catch (IOException e) { throw invalid("账单压缩文件不完整"); }
        if (result.isEmpty()) throw invalid("账单压缩包没有CSV文件");
        return result;
    }
    static List<List<String>> read(StatementFile file, boolean gbkAllowed) {
        byte[] bytes = file.content(); if(bytes.length > MAX_BYTES) throw invalid("账单超过接入大小上限");
        String text;
        try { text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString(); }
        catch (CharacterCodingException e) {
            if (!gbkAllowed) throw invalid("账单不是有效UTF-8格式");
            try { text = Charset.forName("GB18030").newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString(); }
            catch(CharacterCodingException bad){throw invalid("账单编码无法识别");}
        }
        if(text.startsWith("\uFEFF"))text=text.substring(1);
        if(text.indexOf('\0')>=0) throw invalid("账单包含无效字符");
        var rows = new ArrayList<List<String>>(); var row = new ArrayList<String>(); var cell = new StringBuilder(); boolean quoted=false,closedQuote=false;
        for(int i=0;i<text.length();i++){
            char c=text.charAt(i);
            if(closedQuote&&c!=','&&c!='\n'&&c!='\r'){if(c==' '||c=='\t')continue;throw invalid("账单CSV引号后存在非法字符");}
            if(c=='"'&&!gbkAllowed){cell.append(c);}
            else if(c=='"') { if(quoted&&i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else if(quoted){quoted=false;closedQuote=true;}else if(cell.isEmpty())quoted=true;else throw invalid("账单CSV引号格式无效"); }
            else if(!quoted&&(c==','||c=='\n'||c=='\r')){
                row.add(clean(cell.toString()));cell.setLength(0);closedQuote=false;
                if(c!=','){if(c=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;rows.add(List.copyOf(row));row.clear();if(rows.size()>MAX_ROWS+100)throw invalid("账单超过十万行接入上限");}
            } else cell.append(c);
            if(cell.length()>4096||row.size()>128)throw invalid("账单字段或列数超限");
        }
        if(quoted)throw invalid("账单CSV引号未闭合");
        if(!cell.isEmpty()||!row.isEmpty()){row.add(clean(cell.toString()));rows.add(List.copyOf(row));}
        return rows;
    }
    static String clean(String value){String s=value.replace("\uFEFF","").trim();return s.startsWith("`")?s.substring(1):s;}
    static Map<String,Integer> header(List<String> row){var map=new LinkedHashMap<String,Integer>();for(int i=0;i<row.size();i++){String k=row.get(i).replace("（元）","").replace("(元)","").trim();if(map.put(k,i)!=null)throw invalid("账单存在重复列");}return map;}
    static String get(Map<String,Integer> h,List<String> row,String... names){for(String n:names){Integer i=h.get(n);if(i!=null){if(i>=row.size())throw invalid("账单行缺失字段");return row.get(i);}}return null;}
    static String required(Map<String,Integer> h,List<String> row,String...names){String v=get(h,row,names);if(v==null||v.isBlank())throw invalid("账单缺少必要列或值："+names[0]);return v;}
    static BigDecimal money(String value){try{if(value==null||!value.matches("-?[0-9]{1,18}(\\.[0-9]{1,6})?"))throw new IllegalArgumentException();var amount=new BigDecimal(value);if(amount.stripTrailingZeros().scale()>2)throw new IllegalArgumentException();return amount.setScale(6,RoundingMode.UNNECESSARY);}catch(RuntimeException e){throw invalid("账单金额格式或精度无效");}}
    static BigDecimal optionalMoney(String value){return value==null||value.isBlank()?BigDecimal.ZERO.setScale(6):money(value);}
    static Instant time(String value,StatementRequest request){try{Instant t=LocalDateTime.parse(value,DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")).atZone(ZoneId.of("Asia/Shanghai")).toInstant();if(!t.atZone(ZoneId.of("Asia/Shanghai")).toLocalDate().equals(request.businessDate()))throw invalid("账单明细不属于请求账单日");return t;}catch(java.time.format.DateTimeParseException e){throw invalid("账单交易时间无效");}}
    static void same(String expected,String actual,String safe){if(!Objects.equals(expected,actual))throw invalid(safe);}
    static StatementProtocolException invalid(String message){return new StatementProtocolException(message);}
    static BigDecimal sum(List<StatementRow> rows,java.util.function.Function<StatementRow,BigDecimal> value){return rows.stream().map(value).reduce(BigDecimal.ZERO.setScale(6),BigDecimal::add);}
}
