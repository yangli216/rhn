#!/usr/bin/env bash
set -euo pipefail

rhn_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rhn_backend_dir="$rhn_project_root/backend"
rhn_requested_server_port="${RHN_SERVER_PORT:-${RHN_PORT:-}}"
# 本地开发默认带医保与支付 Mock；需要纯 oracle-local 时显式设置 RHN_ORACLE_PROFILES=oracle-local。
rhn_spring_profiles="${RHN_ORACLE_PROFILES:-oracle-local,insurance-mock,payment-mock}"
rhn_oracle_env_file="${RHN_ORACLE_ENV_FILE:-$rhn_project_root/.env.oracle.local}"

if [[ -f "$rhn_oracle_env_file" ]]; then
  set -a
  # This file is local-only and gitignored; it must contain simple KEY=value assignments.
  source "$rhn_oracle_env_file"
  set +a
fi

# Explicit launch settings take priority over checkout-local defaults.
rhn_server_port="${rhn_requested_server_port:-${RHN_SERVER_PORT:-${RHN_PORT:-8080}}}"

for rhn_required_variable in RHN_ORACLE_URL RHN_ORACLE_USER RHN_ORACLE_PASSWORD; do
  if [[ -z "${!rhn_required_variable:-}" ]]; then
    echo "缺少环境变量：$rhn_required_variable（可配置在 $rhn_oracle_env_file）" >&2
    exit 1
  fi
done

if command -v lsof >/dev/null 2>&1 \
    && lsof -nP -iTCP:"$rhn_server_port" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "端口 $rhn_server_port 已被占用，请先正常停止现有实例。" >&2
  exit 1
fi

(cd "$rhn_backend_dir" && mvn -DskipTests package)

rhn_build_artifact="$rhn_backend_dir/rhn-app/target/rhn-application-0.1.0-SNAPSHOT.jar"
rhn_artifact_digest="$(shasum -a 256 "$rhn_build_artifact" | awk '{print substr($1, 1, 16)}')"
rhn_runtime_dir="$rhn_project_root/.runtime/backend"
rhn_runtime_artifact="$rhn_runtime_dir/rhn-application-$rhn_artifact_digest.jar"
mkdir -p "$rhn_runtime_dir"
if [[ ! -f "$rhn_runtime_artifact" ]]; then
  cp "$rhn_build_artifact" "$rhn_runtime_artifact"
fi

# payment-mock：确保演示密钥存在，并让 mock 放宽请求验签（幂等；mock 未启动时只警告，不阻止后端启动）。
if [[ ",$rhn_spring_profiles," == *",payment-mock,"* ]]; then
  export RHN_PAYMENT_MOCK_KEYS="${RHN_PAYMENT_MOCK_KEYS:-$rhn_project_root/.runtime/payment-mock/keys}"
  "$rhn_project_root/scripts/setup-payment-mock.sh" || echo "警告：支付 Mock 准备失败，支付宝/微信/银行卡将不可用" >&2
fi

exec java -jar "$rhn_runtime_artifact" \
  --spring.profiles.active="$rhn_spring_profiles" \
  --server.port="$rhn_server_port" \
  --management.health.redis.enabled=false \
  "$@"
