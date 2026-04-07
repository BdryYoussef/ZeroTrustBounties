#![no_main]
risc0_zkvm::guest::entry!(main);

use risc0_zkvm::guest::env;
use wasmi::{Config, Engine, Linker, Module, Store};
use wasmparser::{Parser, Payload, Operator};
use sha2::{Sha256, Digest};
use std::collections::BTreeSet;

// ─── Constants ────────────────────────────────────────────────────────────────
const BITMAP_SIZE: usize = 8192;
const MAX_STEPS: u64 = 1_000_000;
const MIN_NEW_TRANSITIONS: u32 = 4;
const MIN_NOVELTY_PCT: u32 = 2; // integer percent — (total_new * 100) >= (total_exec * 2)

// ─── Shared Types (must match host exactly) ───────────────────────────────────
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct EmbeddedProp {
    condition_offset: u32,
    trap_target: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
enum ZtbWasmValue {
    I32(i32),
    I64(i64),
}

impl ZtbWasmValue {
    fn to_wasmi(&self) -> wasmi::Value {
        match self {
            ZtbWasmValue::I32(v) => wasmi::Value::I32(*v),
            ZtbWasmValue::I64(v) => wasmi::Value::I64(*v),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct Step {
    function_name: String,
    args: Vec<ZtbWasmValue>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct FinancialConfig {
    authorized_func_indices: Vec<u32>,
    max_delta_pct_of_before: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
enum VerificationMode {
    Strict  = 0,
    Relaxed = 1,
}

struct ExecState {
    validation_failed: bool,
    /// Raw function indices resolved from the WASM export table.
    /// Stored as u32; deduplicated at check time with BTreeSet.
    called_targets: Vec<u32>,
}

impl ExecState {
    fn new() -> Self {
        Self {
            validation_failed: false,
            called_targets: Vec::new(),
        }
    }
}

// ─── SHA-256 helper ───────────────────────────────────────────────────────────
fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

// ─── Static property extractor (mirrors host logic exactly) ───────────────────
fn extract_static_props(wasm: &[u8]) -> Vec<EmbeddedProp> {
    let mut props = Vec::new();
    let mut seen  = BTreeSet::new();
    let parser    = Parser::new(0);

    for payload in parser.parse_all(wasm) {
        let payload = match payload { Ok(p) => p, Err(_) => continue };
        if let Payload::CodeSectionEntry(body) = payload {
            let mut ops = match body.get_operators_reader() {
                Ok(r) => r, Err(_) => continue,
            };
            let mut prev_was_test = false;
            let mut prev_offset   = 0u32;
            loop {
                let (op, offset) = match ops.read_with_offset() {
                    Ok(v)  => v,
                    Err(_) => break,
                };
                let offset = offset as u32;
                let is_test = matches!(op,
                    Operator::I32Eqz | Operator::I32Eq  | Operator::I32Ne  |
                    Operator::I32LtS | Operator::I32LtU | Operator::I32GtS |
                    Operator::I32GtU | Operator::I32LeS | Operator::I32LeU |
                    Operator::I32GeS | Operator::I32GeU |
                    Operator::I64Eqz | Operator::I64Eq  | Operator::I64Ne  |
                    Operator::I64LtS | Operator::I64LtU | Operator::I64GtS |
                    Operator::I64GtU | Operator::I64LeS | Operator::I64LeU |
                    Operator::I64GeS | Operator::I64GeU
                );
                if prev_was_test {
                    if let Operator::BrIf { relative_depth } = op {
                        if !seen.contains(&prev_offset) {
                            seen.insert(prev_offset);
                            props.push(EmbeddedProp {
                                condition_offset: prev_offset,
                                trap_target: relative_depth,
                            });
                        }
                    }
                }
                if let Operator::Unreachable = op {
                    if !seen.contains(&offset) {
                        seen.insert(offset);
                        props.push(EmbeddedProp { condition_offset: offset, trap_target: 0 });
                    }
                }
                prev_was_test = is_test;
                if is_test { prev_offset = offset; }
            }
        }
    }
    props
}

// ─── Bitmap helpers ───────────────────────────────────────────────────────────
fn count_bits(bitmap: &[u8]) -> u32 {
    bitmap.iter().map(|b| b.count_ones() as u32).sum()
}

fn bitmap_and_not(
    exploit:  &[u8; BITMAP_SIZE],
    baseline: &[u8; BITMAP_SIZE],
) -> [u8; BITMAP_SIZE] {
    let mut result = [0u8; BITMAP_SIZE];
    for i in 0..BITMAP_SIZE {
        result[i] = exploit[i] & !baseline[i];
    }
    result
}

/// Dual-bitmap transition recorder.
///
/// Bitmap A — AFL XOR-shift:
///   index = ((prev << 1) XOR curr) mod (BITMAP_SIZE * 8)
///
/// Bitmap B — 32-bit Knuth multiplicative hash:
///   index = (prev + curr * 2654435761) mod (BITMAP_SIZE * 8)
///
/// Both operations must remain purely integer — no f32/f64.
fn update_dual_bitmap(
    a:    &mut [u8; BITMAP_SIZE],
    b:    &mut [u8; BITMAP_SIZE],
    prev: u32,
    curr: u32,
) {
    // Bitmap A: AFL XOR-shift
    let ka = (prev.wrapping_shl(1) ^ curr) as usize % (BITMAP_SIZE * 8);
    a[ka / 8] |= 1 << (ka % 8);

    // Bitmap B: Knuth multiplicative hash (golden ratio constant 2654435761)
    let kb = prev.wrapping_add(curr.wrapping_mul(2_654_435_761u32)) as usize % (BITMAP_SIZE * 8);
    b[kb / 8] |= 1 << (kb % 8);
}

// ─── WASM export index resolver ───────────────────────────────────────────────
/// Resolve a function's index in the WASM function index space by scanning the
/// export section. Returns None if the export is not found or is not a function.
fn resolve_func_index(wasm: &[u8], export_name: &str) -> Option<u32> {
    let parser = Parser::new(0);
    for payload in parser.parse_all(wasm) {
        let payload = match payload { Ok(p) => p, Err(_) => continue };
        if let Payload::ExportSection(reader) = payload {
            for export in reader {
                let export = match export { Ok(e) => e, Err(_) => continue };
                if export.name == export_name {
                    if let wasmparser::ExternalKind::Func = export.kind {
                        return Some(export.index);
                    }
                }
            }
        }
    }
    None
}

// ─── Financial state capture ──────────────────────────────────────────────────
fn capture_financial_state(store: &mut Store<ExecState>, instance: &wasmi::Instance) -> u64 {
    if let Ok(func) = instance.get_typed_func::<(), i32>(&mut *store, "get_balance") {
        if let Ok(val) = func.call(&mut *store, ()) {
            return val as u64;
        }
    }
    0
}

// ─── ztb_validate_state query ─────────────────────────────────────────────────
fn query_validator(instance: &wasmi::Instance, store: &mut Store<ExecState>) -> i32 {
    instance
        .get_typed_func::<(), i32>(&mut *store, "ztb_validate_state")
        .ok()
        .and_then(|f| f.call(&mut *store, ()).ok())
        .unwrap_or(1) // absent = validator always passes (opt-in)
}

// ─── C2: Financial value conservation check (INV-14) ─────────────────────────
/// Returns `true` if the state delta exceeds what the authorized unique function
/// calls are permitted to produce — i.e., an anomalous financial violation.
///
/// Key invariant: a hacker cannot amplify the cap by calling the same authorized
/// function N times, because we deduplicate into a `BTreeSet<u32>` before
/// computing the per-function allowance.
///
/// All arithmetic uses u128 to prevent overflow; no floating point whatsoever.
fn check_value_conservation_v3(
    state_before:   u64,
    state_after:    u64,
    called_targets: &[u32],
    config:         &FinancialConfig,
) -> bool {
    // Zero delta ⇒ no financial effect ⇒ C2 not triggered
    let delta = state_before.abs_diff(state_after);
    if delta == 0 { return false; }

    // Deduplicate called indices that appear in the authorized list.
    // BTreeSet eliminates loop amplification: calling withdraw() 100 times
    // is treated as calling it once.
    let unique_auth: BTreeSet<u32> = called_targets
        .iter()
        .filter(|&t| config.authorized_func_indices.contains(t))
        .copied()
        .collect();

    // Total authorized budget = state_before * max_delta_pct / 100
    // Integer division intentional — no rounding in the attacker's favour.
    let max_total: u128 = (state_before as u128)
        .saturating_mul(config.max_delta_pct_of_before as u128)
        / 100;

    // Per-function cap splits the budget evenly among unique authorized callers.
    let per_cap: u128 = if unique_auth.is_empty() {
        0
    } else {
        max_total / (unique_auth.len() as u128)
    };

    // The total authorized delta is per_cap * unique_auth.len()
    // (equals max_total when evenly divisible; slightly less otherwise — conservative).
    let authorized_delta: u128 = (unique_auth.len() as u128) * per_cap;

    // C2 fires when the actual delta exceeds the authorized budget
    (delta as u128) > authorized_delta
}

// ─── C2 stubs for non-financial domains ───────────────────────────────────────
fn check_privilege_monotonicity() -> bool { false } // T-Y1 extension: Access Control
fn check_cfi()                    -> bool { false } // T-Y1 extension: General CFI

// ─── Guest entry point ────────────────────────────────────────────────────────
pub fn main() {
    // ── Private inputs (provided by the hacker, not revealed on-chain) ────────
    let target_bytes:     Vec<u8>       = env::read();
    let domain:           u8            = env::read();
    let mode_val:         u8            = env::read();
    let mode = if mode_val == 0 { VerificationMode::Strict } else { VerificationMode::Relaxed };
    let financial_config: FinancialConfig = env::read();

    let baseline_a_vec: Vec<u8> = env::read();
    let baseline_b_vec: Vec<u8> = env::read();

    // Exact BITMAP_SIZE byte buffers — panic on malformed input
    let mut baseline_a = [0u8; BITMAP_SIZE];
    let mut baseline_b = [0u8; BITMAP_SIZE];
    baseline_a.copy_from_slice(&baseline_a_vec);
    baseline_b.copy_from_slice(&baseline_b_vec);

    let payload: Vec<Step> = env::read();

    // ── Public commitments (verified against private inputs) ──────────────────
    let expected_cid:    [u8; 32] = env::read(); // SHA256(WASM bytes)
    let expected_ph:     [u8; 32] = env::read(); // SHA256(serialized props)
    let baseline_hash_a: [u8; 32] = env::read(); // SHA256(baseline_a bitmap)
    let baseline_hash_b: [u8; 32] = env::read(); // SHA256(baseline_b bitmap)
    let config_hash:     [u8; 32] = env::read(); // SHA256(serialized FinancialConfig)

    // ── INV-1: Integrity assertions ───────────────────────────────────────────
    assert_eq!(sha256_bytes(&target_bytes),  expected_cid,    "INV-1: CID mismatch");
    assert_eq!(sha256_bytes(&baseline_a),    baseline_hash_a, "INV-1: Baseline A hash mismatch");
    assert_eq!(sha256_bytes(&baseline_b),    baseline_hash_b, "INV-1: Baseline B hash mismatch");

    let serialized_config = bincode::serialize(&financial_config).unwrap_or_default();
    assert_eq!(sha256_bytes(&serialized_config), config_hash, "INV-14: Config hash mismatch");

    // ── INV-14: FinancialConfig bounds ────────────────────────────────────────
    assert!(financial_config.authorized_func_indices.len() <= 8,  "INV-14: Max 8 indices");
    assert!(financial_config.max_delta_pct_of_before      <= 20,  "INV-14: Max 20% delta");

    // ── Props hash ────────────────────────────────────────────────────────────
    let mut props = extract_static_props(&target_bytes);
    props.dedup_by_key(|p| p.condition_offset);
    let serialized_props = bincode::serialize(&props).unwrap_or_default();
    assert_eq!(sha256_bytes(&serialized_props), expected_ph, "Props hash mismatch");

    // ── WASM execution setup ──────────────────────────────────────────────────
    let mut config = Config::default();
    config.consume_fuel(true);
    let engine  = Engine::new(&config);
    let module  = Module::new(&engine, &target_bytes[..]).unwrap();
    let linker  = Linker::<ExecState>::new(&engine);
    let mut store = Store::new(&engine, ExecState::new());
    store.add_fuel(MAX_STEPS).unwrap();

    let instance = linker
        .instantiate(&mut store, &module)
        .unwrap()
        .start(&mut store)
        .unwrap();

    // ── Dual bitmap accumulators ──────────────────────────────────────────────
    let mut exploit_a  = [0u8; BITMAP_SIZE];
    let mut exploit_b  = [0u8; BITMAP_SIZE];
    let mut prev_block = 0u32;

    // ── Pre-execution financial snapshot ─────────────────────────────────────
    let state_before = if domain == 0 {
        capture_financial_state(&mut store, &instance)
    } else {
        0
    };

    let mut c1a_trap_reached = false;

    // ── Payload execution loop ────────────────────────────────────────────────
    for step in &payload {
        let pre_valid = query_validator(&instance, &mut store);

        let func = instance
            .get_func(&store, &step.function_name)
            .expect("Function not found in WASM export table");

        // Resolve the actual WASM function index from the export table.
        // This is the canonical index for INV-14 authorization checks.
        let func_idx = resolve_func_index(&target_bytes, &step.function_name)
            .unwrap_or(u32::MAX); // u32::MAX = "unknown" — will never match authorized list
        store.data_mut().called_targets.push(func_idx);

        // Allocate a result buffer sized to this function's actual return type.
        let func_ty = func.ty(&store);
        let mut results = vec![wasmi::Value::I32(0); func_ty.results().len()];
        let args: Vec<wasmi::Value> = step.args.iter().map(|a| a.to_wasmi()).collect();

        let result = func.call(&mut store, &args, &mut results);

        match result {
            // C1a: WASM trap reached — exploit triggered an assertion/unreachable
            Err(wasmi::Error::Trap(_)) => {
                c1a_trap_reached = true;
                break;
            }
            // Hard failure — propagate to reject the proof
            Err(e) => panic!("Execution error (non-trap): {:?}", e),
            Ok(_)  => {}
        }

        // C1b: ztb_validate_state() transitioned 1 → 0
        let post_valid = query_validator(&instance, &mut store);
        if pre_valid == 1 && post_valid == 0 {
            store.data_mut().validation_failed = true;
        }

        // Record the edge (prev_block → curr_block) in both bitmaps.
        // We use the function index (u32) as the block identifier so that
        // different functions produce distinct edges — purely integer.
        let curr_block = func_idx;
        update_dual_bitmap(&mut exploit_a, &mut exploit_b, prev_block, curr_block);
        prev_block = curr_block;
    }

    // ── Post-execution financial snapshot ────────────────────────────────────
    let state_after = if domain == 0 {
        capture_financial_state(&mut store, &instance)
    } else {
        0
    };

    // Clone called_targets out of the store before the borrow ends
    let called_targets = store.data().called_targets.clone();

    // ── C3: Dual Bitmap Novelty (integer arithmetic only) ────────────────────
    // new_a / new_b = bits set in exploit but NOT in baseline (AND NOT)
    let new_a = bitmap_and_not(&exploit_a, &baseline_a);
    let new_b = bitmap_and_not(&exploit_b, &baseline_b);

    let total_new:  u32 = count_bits(&new_a)   + count_bits(&new_b);
    let total_exec: u32 = count_bits(&exploit_a) + count_bits(&exploit_b);

    // C3 = (total_new >= 4) AND (total_new * 100 >= total_exec * 2)
    // The second condition is the integer equivalent of: new_pct >= 2%
    // No f32/f64 — multiply both sides by 100.
    let c3 = (total_new >= MIN_NEW_TRANSITIONS)
          && (total_new.saturating_mul(100) >= total_exec.saturating_mul(MIN_NOVELTY_PCT));

    let c1b = store.data().validation_failed;
    let c1  = c1a_trap_reached || c1b;

    // ── C2: Domain-specific axiom check ───────────────────────────────────────
    let c2 = match domain {
        0 => check_value_conservation_v3(state_before, state_after, &called_targets, &financial_config),
        1 => check_privilege_monotonicity(),
        2 => check_cfi(),
        _ => false,
    };

    // ── Core verdict gates ────────────────────────────────────────────────────
    // At least one layer (C1 OR C2) must fire — otherwise no exploit was proven
    assert!(c1 || c2, "Verdict: No property violated (C1 and C2 both false)");

    // Strict mode additionally requires proof of novelty (C3)
    if mode == VerificationMode::Strict {
        assert!(c3, "Verdict: C3 required in STRICT mode");
    }

    // ── Verdict label (padded to 8 bytes for abi.decode compatibility) ────────
    let verdict_str: [u8; 8] = if c1a_trap_reached {
        *b"TRAP    "
    } else if c1b {
        *b"VALIDATE"
    } else {
        *b"DOMAIN  "
    };

    // ── Journal commit — 15 fields (must match ZTBEscrow.submitProof decode) ──
    //
    //  # | Name             | Type      | Description
    //  0 | expected_cid     | [u8;32]   | SHA256 of target WASM
    //  1 | domain           | u8        | 0=FINANCIAL 1=ACCESS 2=GENERAL
    //  2 | expected_ph      | [u8;32]   | SHA256 of static props list
    //  3 | baseline_hash_a  | [u8;32]   | SHA256 of bitmap A
    //  4 | baseline_hash_b  | [u8;32]   | SHA256 of bitmap B
    //  5 | config_hash      | [u8;32]   | SHA256 of FinancialConfig
    //  6 | payload_hash     | [u8;32]   | SHA256 of serialized payload
    //  7 | payload_len      | u32       | number of steps
    //  8 | c1a              | bool      | trap reached
    //  9 | c1b              | bool      | ztb_validate_state 1→0
    // 10 | c2               | bool      | domain axiom violated
    // 11 | c3               | bool      | novelty threshold met
    // 12 | total_new        | u32       | new transitions count
    // 13 | mode_val         | u8        | 0=STRICT 1=RELAXED
    // 14 | verdict_str      | [u8;8]    | "TRAP    " | "VALIDATE" | "DOMAIN  "
    let serialized_payload = bincode::serialize(&payload).unwrap_or_default();

    env::commit(&(
        expected_cid,
        domain,
        expected_ph,
        baseline_hash_a,
        baseline_hash_b,
        config_hash,
        sha256_bytes(&serialized_payload),
        payload.len() as u32,
        c1a_trap_reached,
        c1b,
        c2,
        c3,
        total_new,
        mode_val,
        verdict_str,
    ));
}
