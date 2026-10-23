#!/usr/bin/env bash
# 本地支付 Mock 联调准备：生成一次性演示密钥，并让 rhn-thirdparty-mocks 放宽请求验签。
# 仅限本机开发；密钥写入 .runtime/payment-mock/keys（已被 .gitignore 忽略），不进入仓库。
#
# 用法：scripts/setup-payment-mock.sh
# 之后以 RHN_ORACLE_PROFILES=oracle-local,insurance-mock,payment-mock 启动后端，并设置
#   RHN_PAYMENT_MOCK_KEYS=<本脚本输出的密钥目录>
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keys="${RHN_PAYMENT_MOCK_KEYS:-$root/.runtime/payment-mock/keys}"
mock_url="${RHN_PAYMENT_MOCK_URL:-http://127.0.0.1:18090}"
mock_alipay_key="${RHN_PAYMENT_MOCK_ALIPAY_PRIVATE_KEY:-$(cd "$root/.." && pwd)/rhn-thirdparty-mocks/src/main/resources/mock/alipay/alipay-private-key.pem}"
wechat_mch_id="1900000109"

mkdir -p "$keys"
if [[ ! -f "$keys/app-private-key.pem" ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$keys/app-private-key.pem" 2>/dev/null
fi
# 支付宝公钥 = mock 用于响应加签的私钥所对应的公钥，RHN 用它验应答。
[[ -f "$mock_alipay_key" ]] || { echo "找不到 mock 支付宝密钥：$mock_alipay_key" >&2; exit 1; }
openssl pkey -in "$mock_alipay_key" -pubout -out "$keys/alipay-public-key.pem" 2>/dev/null
# 微信商户证书：口令等于商户号，与 WxJava initSSLContext() 约定一致。
if [[ ! -f "$keys/merchant.p12" ]]; then
  keytool -genkeypair -alias merchant -keyalg RSA -keysize 2048 -storetype PKCS12 -dname "CN=$wechat_mch_id" \
    -storepass "$wechat_mch_id" -keypass "$wechat_mch_id" -validity 3650 -keystore "$keys/merchant.p12" >/dev/null 2>&1
fi

# 请求验签用的应用公钥在 mock 里是固定的，与本地新生成的应用私钥不配对，所以运行时关闭请求验签（mock 重启后需重跑本脚本）。
if curl -fsS -m 3 "$mock_url/mock/health" >/dev/null 2>&1; then
  curl -fsS -m 3 -X PUT -H 'Content-Type: application/json' -d '{"requireRequestSign":false}' \
    "$mock_url/mock/config?protocol=alipay" >/dev/null
  curl -fsS -m 3 -X PUT -H 'Content-Type: application/json' -d '{"requireRequestSign":false}' \
    "$mock_url/mock/config?protocol=wxpay" >/dev/null
  echo "已关闭 mock 的支付宝/微信请求验签"
else
  echo "警告：$mock_url 不可达，请先启动 rhn-thirdparty-mocks 再重跑本脚本" >&2
fi
echo "密钥目录：$keys"
echo "启动后端：RHN_PAYMENT_MOCK_KEYS=$keys RHN_ORACLE_PROFILES=oracle-local,insurance-mock,payment-mock scripts/run-oracle-local.sh"
