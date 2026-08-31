#!/usr/bin/env bash
set -euo pipefail

RhnProjectRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RhnProjectRoot/backend"

mvn -Dgroups=outpatient-main-flow test
mvn -Dtest=ArchitectureTest test
