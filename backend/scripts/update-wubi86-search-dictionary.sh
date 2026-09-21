#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
backend_dir=$(cd "$script_dir/.." && pwd)
resource_dir="$backend_dir/src/main/resources/master-data-search"
dictionary_url="https://raw.githubusercontent.com/rime/rime-wubi/master/wubi86.dict.yaml"
license_url="https://raw.githubusercontent.com/rime/rime-wubi/master/LICENSE"

mkdir -p "$resource_dir"

curl -fsS "$dictionary_url" | perl -CSDA -F'\t' -lane '
    next if /^#/ || @F < 2 || length($F[0]) != 1 || $seen{$F[0]}++;
    $code = uc(substr($F[1], 0, 1));
    print "$F[0]\t$code" if $code =~ /^[A-Z]$/;
' > "$resource_dir/wubi86-single.tsv"

curl -fsS "$license_url" > "$resource_dir/THIRD_PARTY_LICENSE_wubi86.txt"

echo "Generated $(wc -l < "$resource_dir/wubi86-single.tsv" | tr -d ' ') Wubi86 single-character search codes."
