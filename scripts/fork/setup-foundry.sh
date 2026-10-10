#!/usr/bin/env bash
# Installs foundry v1.8.5 into ./.foundry-bin (does NOT touch ~/.foundry). Older anvil (1.6.0-nightly Apr 2026)
# reads TIP-20 transferPolicyId as 0 on a Tempo mainnet fork -> every transfer reverts PolicyForbids.
set -euo pipefail; cd "$(dirname "$0")"; mkdir -p .foundry-bin
OS=$(uname -s | tr A-Z a-z); ARCH=$(uname -m); [ "$ARCH" = x86_64 ] && ARCH=amd64; [ "$ARCH" = aarch64 ] && ARCH=arm64
curl -sL "https://github.com/foundry-rs/foundry/releases/download/v1.8.5/foundry_v1.8.5_${OS}_${ARCH}.tar.gz" | tar xz -C .foundry-bin
.foundry-bin/anvil --version | head -1
