#![no_main]
risc0_zkvm::guest::entry!(main);

use risc0_zkvm::guest::env;
use wasmi::{Config, Engine, Linker, Module, Store};
use wasmparser::{Parser, Payload, Operator};
use sha2::{Sha256, Digest};
use std::collections::BTreeSet;

// --- Constants & Types ---
const BITMAP_SIZE: usize = 8192;
const MAX_STEPS: u64 = 1_000_000;
const MIN_NEW_TRANSITIONS: u32 = 4;
const MIN_NOVELTY_PCT: u32 = 2; 

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
    Strict = 0,
    Relaxed = 1,
}

struct ExecState {
    validation_failed: bool,
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

// --- Helper Functions ---
fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

fn extract_static_props(wasm: &[u8]) -> Vec<EmbeddedProp> {
    let mut props = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    let parser = Parser::new(0);

    for payload in parser.parse_all(wasm) {
        let payload = match payload { Ok(p) => p, Err(_) => continue };
        if let Payload::CodeSectionEntry(body) = payload {
            let mut ops = match body.get_operators_reader() {
                Ok(r) => r, Err(_) => continue,
            };
            let mut prev_was_test = false;
            let mut prev_offset = 0u32;
            loop {
                let (op, offset) = match ops.read_with_offset() {
                    Ok(v) => v,
                    Err(_) => break,
                };
                let offset = offset as u32;
                let is_test = matches!(op,
                    Operator::I32Eqz | Operator::I32Eq | Operator::I32Ne |
                    Operator::I32LtS | Operator::I32LtU | Operator::I32GtS |
                    Operator::I32GtU | Operator::I32LeS | Operator::I32LeU |
                    Operator::I32GeS | Operator::I32GeU |
                    Operator::I64Eqz | Operator::I64Eq | Operator::I64Ne |
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
                        props.push(EmbeddedProp {
                            condition_offset: offset,
                            trap_target: 0,
                        });
                    }
                }
                prev_was_test = is_test;
                if is_test { prev_offset = offset; }
            }
        }
    }
    props
}

fn count_bits(bitmap: &[u8]) -> u32 {
    bitmap.iter().map(|b| b.count_ones() as u32).sum()
}

fn bitmap_and_not(exploit: &[u8; BITMAP_SIZE], baseline: &[u8; BITMAP_SIZE]) -> [u8; BITMAP_SIZE] {
    let mut result = [0u8; BITMAP_SIZE];
    for i in 0..BITMAP_SIZE {
        result[i] = exploit[i] & !baseline[i];
    }
    result
}

fn update_dual_bitmap(a: &mut [u8; BITMAP_SIZE], b: &mut [u8; BITMAP_SIZE], prev: u32, curr: u32) {
    let ka = (prev.wrapping_shl(1) ^ curr) as usize % (BITMAP_SIZE * 8);
    a[ka / 8] |= 1 << (ka % 8);

    let kb = (prev.wrapping_add(curr.wrapping_mul(2654435761))) as usize % (BITMAP_SIZE * 8);
    b[kb / 8] |= 1 << (kb % 8);
}

fn capture_financial_state(store: &mut Store<ExecState>, instance: &wasmi::Instance) -> u64 {
    if let Ok(func) = instance.get_typed_func::<(), i32>(&mut *store, "get_balance") {
        if let Ok(val) = func.call(&mut *store, ()) {
            return val as u64; 
        }
    }
    0
}

fn query_validator(instance: &wasmi::Instance, store: &mut Store<ExecState>) -> i32 {
    instance
        .get_typed_func::<(), i32>(&mut *store, "ztb_validate_state")
        .ok()
        .and_then(|f| f.call(&mut *store, ()).ok())
        .unwrap_or(1) 
}

fn check_value_conservation_v3(
    state_before: u64,
    state_after: u64,
    called_targets: &[u32],
    config: &FinancialConfig,
) -> bool {
    let delta = state_before.abs_diff(state_after);
    if delta == 0 { return false; } 

    let unique_auth: BTreeSet<u32> = called_targets.iter()
        .filter(|&t| config.authorized_func_indices.contains(t))
        .copied()
        .collect();

    let max_total = (state_before as u128)
        .saturating_mul(config.max_delta_pct_of_before as u128) / 100;

    let per_cap = if unique_auth.is_empty() {
        0u128
    } else {
        max_total / (unique_auth.len() as u128)
    };

    let authorized_delta = (unique_auth.len() as u128) * per_cap;
    (delta as u128) > authorized_delta
}

fn check_privilege_monotonicity() -> bool { false }
fn check_cfi() -> bool { false }

// --- Main Proof Guest ---
pub fn main() {
    let target_bytes: Vec<u8> = env::read();
    let domain: u8 = env::read();
    let mode_val: u8 = env::read();
    let mode = if mode_val == 0 { VerificationMode::Strict } else { VerificationMode::Relaxed };
    let financial_config: FinancialConfig = env::read();
    
    let baseline_a_vec: Vec<u8> = env::read();
    let baseline_b_vec: Vec<u8> = env::read();
    
    let mut baseline_a = [0u8; BITMAP_SIZE];
    let mut baseline_b = [0u8; BITMAP_SIZE];
    baseline_a.copy_from_slice(&baseline_a_vec);
    baseline_b.copy_from_slice(&baseline_b_vec);

    let payload: Vec<Step> = env::read();

    let expected_cid: [u8; 32] = env::read();
    let expected_ph: [u8; 32] = env::read();
    let baseline_hash_a: [u8; 32] = env::read();
    let baseline_hash_b: [u8; 32] = env::read();
    let config_hash: [u8; 32] = env::read();

    assert_eq!(sha256_bytes(&target_bytes), expected_cid, "INV-1: CID mismatch");
    assert_eq!(sha256_bytes(&baseline_a), baseline_hash_a, "Baseline A hash mismatch");
    assert_eq!(sha256_bytes(&baseline_b), baseline_hash_b, "Baseline B hash mismatch");

    let serialized_config = bincode::serialize(&financial_config).unwrap_or_default();
    assert_eq!(sha256_bytes(&serialized_config), config_hash, "Config hash mismatch");

    assert!(financial_config.authorized_func_indices.len() <= 8, "INV-14: Max 8 indices");
    assert!(financial_config.max_delta_pct_of_before <= 20, "INV-14: Max 20% delta");

    let mut props = extract_static_props(&target_bytes);
    props.dedup_by_key(|p| p.condition_offset);
    let serialized_props = bincode::serialize(&props).unwrap_or_default();
    assert_eq!(sha256_bytes(&serialized_props), expected_ph, "Props hash mismatch");

    let mut config = Config::default();
    config.consume_fuel(true);
    let engine = Engine::new(&config);
    let module = Module::new(&engine, &target_bytes[..]).unwrap();
    let linker = Linker::<ExecState>::new(&engine);
    let mut store = Store::new(&engine, ExecState::new());
    store.add_fuel(MAX_STEPS).unwrap(); 

    let instance = linker.instantiate(&mut store, &module).unwrap().start(&mut store).unwrap();

    let mut exploit_a = [0u8; BITMAP_SIZE];
    let mut exploit_b = [0u8; BITMAP_SIZE];
    let mut prev_block = 0u32;

    let state_before = if domain == 0 { capture_financial_state(&mut store, &instance) } else { 0 };
    let mut c1a_trap_reached = false;

    for step in &payload {
        let pre_valid = query_validator(&instance, &mut store);
        let func = instance.get_func(&store, &step.function_name).expect("Function not found");
        
        let func_idx = step.function_name.len() as u32; 
        store.data_mut().called_targets.push(func_idx);

        let args: Vec<wasmi::Value> = step.args.iter().map(|a| a.to_wasmi()).collect();
        
        // --- LE FIX EST ICI ---
        // On demande à wasmi le nombre exact de résultats que cette fonction renvoie
        let func_ty = func.ty(&store);
        let mut results = vec![wasmi::Value::I32(0); func_ty.results().len()];
        
        // On passe notre tableau de résultats alloué à la bonne taille
        let result = func.call(&mut store, &args, &mut results);

        if let Err(wasmi::Error::Trap(_)) = result {
            c1a_trap_reached = true;
            break; 
        } else if let Err(e) = result {
            panic!("Execution failed with non-trap error: {:?}", e);
        }

        let post_valid = query_validator(&instance, &mut store);
        if pre_valid == 1 && post_valid == 0 {
            store.data_mut().validation_failed = true;
        }

        let curr_block = step.function_name.len() as u32 * 10;
        update_dual_bitmap(&mut exploit_a, &mut exploit_b, prev_block, curr_block);
        prev_block = curr_block;
    }

    let state_after = if domain == 0 { capture_financial_state(&mut store, &instance) } else { 0 };
    let called_targets = store.data().called_targets.clone();

    let new_a = bitmap_and_not(&exploit_a, &baseline_a);
    let new_b = bitmap_and_not(&exploit_b, &baseline_b);

    let total_new = count_bits(&new_a) + count_bits(&new_b);
    let total_exec = count_bits(&exploit_a) + count_bits(&exploit_b);

    let c3 = (total_new >= MIN_NEW_TRANSITIONS) && (total_new * 100 >= total_exec * MIN_NOVELTY_PCT);

    let c1b = store.data().validation_failed;
    let c1 = c1a_trap_reached || c1b;

    let c2 = match domain {
        0 => check_value_conservation_v3(state_before, state_after, &called_targets, &financial_config),
        1 => check_privilege_monotonicity(),
        2 => check_cfi(),
        _ => false,
    };

    assert!(c1 || c2, "Verdict: Aucune propriete violee (C1/C2 failed)");
    
    if mode == VerificationMode::Strict {
        assert!(c3, "Verdict: C3 requis en mode STRICT");
    }

    let verdict_str: [u8; 8] = if c1a_trap_reached {
        *b"TRAP    "
    } else if c1b {
        *b"VALIDATE"
    } else {
        *b"DOMAIN  "
    };

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
