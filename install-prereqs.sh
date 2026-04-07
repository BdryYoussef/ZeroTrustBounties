#!/usr/bin/env bash
# =============================================================================
#  ZTB V4.3 — Prerequisite Installer
#  Run this ONCE before start.sh if tools are not yet installed.
#  Ubuntu / Debian Linux
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log() { echo -e "${CYAN}[INSTALL]${RESET} $*"; }
ok()  { echo -e "${GREEN}[✓]${RESET}  $*"; }
warn(){ echo -e "${YELLOW}[!]${RESET}  $*"; }

# ── 1. Node.js 20 via nvm ────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  log "Installing nvm + Node.js 20..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  ok "Node.js $(node --version) installed"
else
  ok "Node.js $(node --version) already installed"
fi

# Ensure nvm sourced for this session
export NVM_DIR="$HOME/.nvm"
[[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"

# ── 2. Foundry (forge + anvil + cast) ───────────────────────────────────────
if ! command -v anvil &>/dev/null; then
  log "Installing Foundry (forge, anvil, cast)..."
  curl -L https://foundry.paradigm.xyz | bash
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup
  ok "Foundry installed: $(anvil --version)"
else
  ok "Foundry already installed: $(anvil --version)"
fi
export PATH="$HOME/.foundry/bin:$PATH"

# ── 3. Rust + RISC Zero ─────────────────────────────────────────────────────
if ! command -v cargo &>/dev/null; then
  log "Installing Rust toolchain..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
  source "$HOME/.cargo/env"
  ok "Rust $(rustc --version) installed"
else
  ok "Rust already installed: $(rustc --version)"
fi
source "$HOME/.cargo/env" 2>/dev/null || true

# Install RISC Zero toolchain (rzup)
if ! command -v rzup &>/dev/null && [[ ! -x "$HOME/.risc0/bin/rzup" ]]; then
  log "Installing RISC Zero toolchain (rzup)..."
  curl -L https://risczero.com/install | bash
  export PATH="$HOME/.risc0/bin:$PATH"
  rzup install
  ok "RISC Zero toolchain installed"
else
  ok "RISC Zero toolchain already present"
  export PATH="$HOME/.risc0/bin:$PATH"
fi

# ── 4. Ensure rust-src component ─────────────────────────────────────────────
rustup component add rust-src 2>/dev/null || true
ok "rust-src component ready"

# ── 5. Final check ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${GREEN}  All prerequisites installed!${RESET}"
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo "  Reload your shell or run:"
echo "    source ~/.bashrc   (or ~/.zshrc)"
echo ""
echo "  Then launch the demo:"
echo "    ./start.sh"
echo ""

# Hint for PATH reload
warn "If 'anvil', 'cargo', or 'node' are not found after this script,"
warn "close and reopen your terminal, or run: source ~/.bashrc"
