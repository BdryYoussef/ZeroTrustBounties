#!/usr/bin/env bash
# =============================================================================
#  ZTB V4.3 — Local Demo Orchestrator
#  Zero-Trust Bounties — Engineering Degree Presentation
#  École EMSI — 2025-2026
# =============================================================================
set -euo pipefail

# ─── Load nvm / user PATH (needed when run as non-interactive shell script) ──
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh" --no-use
# Also pick up foundry and cargo if installed
[[ -d "$HOME/.foundry/bin" ]] && export PATH="$HOME/.foundry/bin:$PATH"
[[ -d "$HOME/.cargo/bin"   ]] && export PATH="$HOME/.cargo/bin:$PATH"
[[ -d "$HOME/.risc0/bin"   ]] && export PATH="$HOME/.risc0/bin:$PATH"

# ─── CRITICAL: Dev-mode zkVM (fast simulation, no Groth16 proving) ──────────
export RISC0_DEV_MODE=1

# ─── Suppress Hardhat's first-run telemetry prompt ───────────────────────────
export HARDHAT_TELEMETRY_OPTOUT=1

# ─── Colours ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZTB_ZKVM="${SCRIPT_DIR}/ztb-zkvm"
ZTB_FRONTEND="${SCRIPT_DIR}/ztb-frontend"

log()   { echo -e "${CYAN}[ZTB]${RESET} $*"; }
ok()    { echo -e "${GREEN}[✓]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[!]${RESET}  $*"; }
die()   { echo -e "${RED}[✗]${RESET}  $*" >&2; exit 1; }

# ─── Prerequisite Check ──────────────────────────────────────────────────────
check_prereq() {
  local missing=()

  command -v node  &>/dev/null || missing+=("node (install: nvm install 20)")
  command -v npm   &>/dev/null || missing+=("npm (comes with node)")
  command -v anvil &>/dev/null || missing+=("anvil (install: curl -L https://foundry.paradigm.xyz | bash && foundryup)")
  command -v cargo &>/dev/null || missing+=("cargo (install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh)")

  if [[ ${#missing[@]} -gt 0 ]]; then
    die "Missing prerequisites:\n$(printf '  • %s\n' "${missing[@]}")\n\nSee README.md for install instructions."
  fi

  # Ensure RISC Zero toolchain is installed
  if ! cargo rzup --version &>/dev/null 2>&1 && ! rzup --version &>/dev/null 2>&1; then
    warn "rzup not found. Installing RISC Zero toolchain..."
    curl -L https://risczero.com/install | bash
    # Source the updated PATH
    export PATH="$HOME/.risc0/bin:$PATH"
    rzup install || warn "rzup install failed — continuing (RISC0_DEV_MODE=1 may still work with cargo only)"
  fi
}

# ─── Step 1: Anvil ───────────────────────────────────────────────────────────
start_anvil() {
  local ANVIL_PORT=8545

  if lsof -i ":${ANVIL_PORT}" &>/dev/null || ss -tlnp | grep -q ":${ANVIL_PORT} "; then
    ok "Anvil already running on port ${ANVIL_PORT}"
    return 0
  fi

  log "Starting Anvil (local EVM node) on port ${ANVIL_PORT}..."
  anvil \
    --port "${ANVIL_PORT}" \
    --chain-id 31337 \
    --block-time 1 \
    --accounts 10 \
    --balance 10000 \
    --gas-limit 30000000 \
    > "${SCRIPT_DIR}/anvil.log" 2>&1 &

  ANVIL_PID=$!
  echo "${ANVIL_PID}" > "${SCRIPT_DIR}/anvil.pid"

  log "Waiting for Anvil to be ready..."
  sleep 2

  # Health check
  local attempts=0
  until curl -sf -X POST http://127.0.0.1:${ANVIL_PORT} \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    &>/dev/null; do
    attempts=$((attempts + 1))
    if [[ ${attempts} -gt 15 ]]; then
      die "Anvil failed to start. Check anvil.log for details."
    fi
    sleep 1
  done

  ok "Anvil is running (PID ${ANVIL_PID}, chain 31337)"
}

# ─── Step 2: Deploy Contracts ────────────────────────────────────────────────
deploy_contracts() {
  log "Installing frontend dependencies (this may take a moment)..."
  cd "${ZTB_FRONTEND}"

  npm install --legacy-peer-deps --silent 2>/dev/null \
    || npm install --legacy-peer-deps 2>&1 | tail -5

  ok "Node dependencies installed"

  # Step A: Compile contracts with Hardhat (generates artifacts/ directory)
  log "Compiling Solidity contracts..."
  npx hardhat compile --config hardhat.config.cjs 2>&1
  ok "Contracts compiled"

  # Step B: Deploy using raw Node + ethers v6 (bypasses hardhat-ethers network hang)
  log "Deploying ZTBEscrow + MockUSDT + MockVerifier to Anvil..."
  node scripts/deploy.cjs 2>&1

  ok "Smart contracts deployed"
}

# ─── Step 3: Verify frontend patching ────────────────────────────────────────
verify_frontend_patch() {
  local ENV_FILE="${ZTB_FRONTEND}/.env.local"

  if [[ ! -f "${ENV_FILE}" ]]; then
    die ".env.local was not created by the deployment script! Aborting."
  fi

  local ADDR
  ADDR=$(grep "^NEXT_PUBLIC_ESCROW_ADDRESS=" "${ENV_FILE}" | cut -d= -f2)

  if [[ -z "${ADDR}" || "${ADDR}" == "0x0000000000000000000000000000000000000000" ]]; then
    die "NEXT_PUBLIC_ESCROW_ADDRESS is empty or zero in .env.local! Deploy failed."
  fi

  ok "Frontend env patched: ZTBEscrow @ ${ADDR}"

  local WAGMI_CONFIG="${ZTB_FRONTEND}/lib/wagmi.config.ts"
  if grep -q "foundry" "${WAGMI_CONFIG}"; then
    ok "wagmi.config.ts → Anvil (foundry chain 31337)"
  else
    warn "wagmi.config.ts may not be patched correctly — check manually"
  fi
}

# ─── Step 4: zkVM Smoke-test (fully async — never blocks frontend) ───────────
run_zkvm_demo() {
  log "Launching zkVM build + demo in background (RISC0_DEV_MODE=1)..."
  log "This takes a few minutes — tail zkvm-demo.log to follow progress"

  # Run the entire build + execute in a background subshell so Phase 5 starts now
  (
    cd "${ZTB_ZKVM}"
    echo "[zkVM] Starting cargo build --release at $(date)" >> "${SCRIPT_DIR}/zkvm-demo.log"
    if RISC0_DEV_MODE=1 cargo build --release >> "${SCRIPT_DIR}/zkvm-demo.log" 2>&1; then
      echo "[zkVM] Build OK — running host at $(date)" >> "${SCRIPT_DIR}/zkvm-demo.log"
      RISC0_DEV_MODE=1 cargo run --release >> "${SCRIPT_DIR}/zkvm-demo.log" 2>&1
    else
      echo "[zkVM] Build FAILED — check Cargo deps in ztb-zkvm/host/Cargo.toml" >> "${SCRIPT_DIR}/zkvm-demo.log"
    fi
  ) &

  ZK_PID=$!
  echo "${ZK_PID}" > "${SCRIPT_DIR}/zkvm.pid"
  ok "zkVM build+demo dispatched in background (PID ${ZK_PID})"
  ok "Follow with:  tail -f ${SCRIPT_DIR}/zkvm-demo.log"
}

# ─── Step 5: Frontend dev server ─────────────────────────────────────────────
start_frontend() {
  cd "${ZTB_FRONTEND}"

  local PORT=3000
  if lsof -i ":${PORT}" &>/dev/null; then
    warn "Port ${PORT} already in use — frontend may already be running"
    return 0
  fi

  log "Starting Next.js dev server on http://localhost:${PORT} ..."
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║         ZTB V4.3 — STACK READY FOR DEMO             ║${RESET}"
  echo -e "${BOLD}╠══════════════════════════════════════════════════════╣${RESET}"
  echo -e "${BOLD}║  🔗 Frontend  : http://localhost:3000                ║${RESET}"
  echo -e "${BOLD}║  ⛏  Anvil    : http://127.0.0.1:8545               ║${RESET}"
  echo -e "${BOLD}║  📋 Logs      : ./anvil.log, ./zkvm-demo.log        ║${RESET}"
  echo -e "${BOLD}║  🔑 Accounts  : see anvil.log (10 × 10000 ETH)      ║${RESET}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${YELLOW}MetaMask Config:${RESET}"
  echo -e "    Network Name : Anvil Local"
  echo -e "    RPC URL      : http://127.0.0.1:8545"
  echo -e "    Chain ID     : 31337"
  echo -e "    Currency     : ETH"
  echo ""
  echo -e "  ${YELLOW}Import test account (Account 0):${RESET}"
  echo -e "    Private Key  : 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  echo -e "    Address      : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  echo ""
  echo -e "  ${GREEN}Press Ctrl+C to stop all services${RESET}"
  echo ""

  # Trap to clean up on exit
  trap cleanup EXIT INT TERM

  # Start frontend in foreground (blocking — last step)
  NEXT_PUBLIC_ESCROW_ADDRESS="$(grep '^NEXT_PUBLIC_ESCROW_ADDRESS=' .env.local | cut -d= -f2)" \
  NEXT_PUBLIC_CHAIN_ID=31337 \
  NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545 \
  npm run dev -- --port ${PORT}
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  log "Shutting down ZTB demo stack..."

  if [[ -f "${SCRIPT_DIR}/anvil.pid" ]]; then
    local ANVIL_PID
    ANVIL_PID=$(cat "${SCRIPT_DIR}/anvil.pid")
    kill "${ANVIL_PID}" 2>/dev/null && ok "Anvil stopped" || true
    rm -f "${SCRIPT_DIR}/anvil.pid"
  fi

  if [[ -f "${SCRIPT_DIR}/zkvm.pid" ]]; then
    local ZK_PID
    ZK_PID=$(cat "${SCRIPT_DIR}/zkvm.pid")
    kill "${ZK_PID}" 2>/dev/null && ok "zkVM process stopped" || true
    rm -f "${SCRIPT_DIR}/zkvm.pid"
  fi

  ok "All services stopped. Goodbye! 👋"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  clear
  echo ""
  echo -e "${BOLD}${CYAN}"
  echo "  ███████╗████████╗██████╗      ██╗   ██╗██╗  ██╗██████╗"
  echo "     ███╔╝╚══██╔══╝██╔══██╗    ██╔   ██║██║  ██║╚════██╗"
  echo "    ███╔╝    ██║   ██████╔╝    ╚██╗ ██╔╝███████║  ███╔╝"
  echo "   ███╔╝     ██║   ██╔══██╗     ╚████╔╝ ╚════██║ ███╔╝"
  echo "  ████████╗  ██║   ██████╔╝      ╚██╔╝        ██║ ██████╗"
  echo "  ╚═══════╝  ╚═╝   ╚═════╝        ╚═╝         ╚═╝ ╚═════╝"
  echo -e "${RESET}"
  echo -e "  ${BOLD}Zero-Trust Bounties V4.3${RESET} — EMSI Engineering Demo"
  echo -e "  ${CYAN}RISC0_DEV_MODE=1 SET — ZK Simulation Mode Active${RESET}"
  echo ""

  log "Phase 0: Checking prerequisites..."
  check_prereq
  ok "All prerequisites found"

  log "Phase 1: Starting Anvil EVM node..."
  start_anvil

  log "Phase 2: Deploying smart contracts..."
  deploy_contracts

  log "Phase 3: Verifying frontend configuration..."
  verify_frontend_patch

  log "Phase 4: Starting zkVM demo (background, RISC0_DEV_MODE=1)..."
  run_zkvm_demo

  log "Phase 5: Launching Next.js frontend..."
  start_frontend
}

main "$@"
