#![no_main]
risc0_zkvm::guest::entry!(main);

use risc0_zkvm::guest::env;
use wasmparser::{Parser, Payload, Operator};
use sha2::{Sha256, Digest};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct EmbeddedProp {
    condition_offset: u32,
    trap_target:      u32,
}

fn extract_conditional_traps(wasm: &[u8]) -> Vec<EmbeddedProp> {
    let mut props   = Vec::new();
    let mut seen    = std::collections::BTreeSet::new();
    let parser      = Parser::new(0);

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
                    Operator::I32Eqz   | Operator::I32Eq  | Operator::I32Ne  |
                    Operator::I32LtS   | Operator::I32LtU | Operator::I32GtS |
                    Operator::I32GtU   | Operator::I32LeS | Operator::I32LeU |
                    Operator::I32GeS   | Operator::I32GeU |
                    Operator::I64Eqz   | Operator::I64Eq  | Operator::I64Ne  |
                    Operator::I64LtS   | Operator::I64LtU | Operator::I64GtS |
                    Operator::I64GtU   | Operator::I64LeS | Operator::I64LeU |
                    Operator::I64GeS   | Operator::I64GeU
                );

                // BrIf apres un test = conditional trap potentiel
                if prev_was_test {
                    if let Operator::BrIf { relative_depth } = op {
                        if !seen.contains(&prev_offset) {
                            seen.insert(prev_offset);
                            props.push(EmbeddedProp {
                                condition_offset: prev_offset,
                                trap_target:      relative_depth,
                            });
                        }
                    }
                }

                // Unreachable direct = trap sans condition (panic!)
                if let Operator::Unreachable = op {
                    if !seen.contains(&offset) {
                        seen.insert(offset);
                        props.push(EmbeddedProp {
                            condition_offset: offset,
                            trap_target:      0,
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

fn count_br_instructions(wasm: &[u8]) -> usize {
    let mut count  = 0usize;
    let parser     = Parser::new(0);
    for payload in parser.parse_all(wasm) {
        let payload = match payload { Ok(p) => p, Err(_) => continue };
        if let Payload::CodeSectionEntry(body) = payload {
            let mut ops = match body.get_operators_reader() {
                Ok(r) => r, Err(_) => continue,
            };
            loop {
                match ops.read() {
                    Ok(op) => {
                        if matches!(op,
                            Operator::Br{..}   | Operator::BrIf{..} |
                            Operator::Call{..} | Operator::CallIndirect{..} |
                            Operator::Return
                        ) { count += 1; }
                    }
                    Err(_) => break,
                }
            }
        }
    }
    count
}

fn popcount(bitmap: &[u8]) -> usize {
    bitmap.iter().map(|b| b.count_ones() as usize).sum()
}

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

fn merkle_root(bitmap: &[u8]) -> [u8; 32] {
    // Merkle simple sur chunks de 64 bytes
    let chunks: Vec<[u8; 32]> = bitmap
        .chunks(64)
        .map(|c| sha256_bytes(c))
        .collect();
    if chunks.is_empty() { return [0u8; 32]; }
    let mut level = chunks;
    while level.len() > 1 {
        level = level.chunks(2).map(|pair| {
            let mut combined = [0u8; 64];
            combined[..32].copy_from_slice(&pair[0]);
            if pair.len() > 1 {
                combined[32..].copy_from_slice(&pair[1]);
            } else {
                combined[32..].copy_from_slice(&pair[0]);
            }
            sha256_bytes(&combined)
        }).collect();
    }
    level[0]
}

pub fn main() {
    // ── ENTREES PRIVEES ───────────────────────────────────────
    let wasm_bytes:   Vec<u8>      = env::read();
    let baseline_a:   Vec<u8>      = env::read(); // 8192 bytes
    let baseline_b:   Vec<u8>      = env::read(); // 8192 bytes
    let domain:       u8           = env::read(); // 0=FIN 1=ACC 2=GEN

    // ── ENTREES PUBLIQUES ─────────────────────────────────────
    let expected_cid: [u8; 32]     = env::read();

    // ── 1. INTEGRITE CID ─────────────────────────────────────
    let cid = sha256_bytes(&wasm_bytes);
    assert_eq!(cid, expected_cid, "CID invalide");

    // ── 2. EXTRACTION ASSERTIONS ──────────────────────────────
    let props = extract_conditional_traps(&wasm_bytes);

    // ── 3. SEUIL MINIMUM PAR DOMAINE ─────────────────────────
    let min_props: usize = match domain {
        0 => 3, // FINANCIAL
        1 => 2, // ACCESS
        _ => 1, // GENERAL
    };
    assert!(
        props.len() >= min_props,
        "Densite assertions insuffisante pour ce domaine"
    );

    // ── 4. SEUIL BASELINE 20% dans A ET B ────────────────────
    let total_trans = count_br_instructions(&wasm_bytes).max(1);
    let filled_a    = popcount(&baseline_a);
    let filled_b    = popcount(&baseline_b);
    assert!(filled_a * 5 >= total_trans, "Baseline A < 20%");
    assert!(filled_b * 5 >= total_trans, "Baseline B < 20%");

    // ── 5. MERKLE ROOTS ───────────────────────────────────────
    let merkle_a = merkle_root(&baseline_a);
    let merkle_b = merkle_root(&baseline_b);

    // ── 6. HASHES PUBLICS ─────────────────────────────────────
    let serialized  = bincode::serialize(&props).unwrap_or_default();
    let props_hash  = sha256_bytes(&serialized);
    let hash_a      = sha256_bytes(&baseline_a);
    let hash_b      = sha256_bytes(&baseline_b);
    let density     = props.len() as u32;
    let total       = total_trans as u32;

    // ── 7. JOURNAL PUBLIC ─────────────────────────────────────
    env::commit(&(
        expected_cid,   // cid du WASM
        props_hash,     // hash des assertions extraites
        density,        // nb assertions uniques
        total,          // nb transitions possibles
        hash_a,         // hash baseline A
        hash_b,         // hash baseline B
        merkle_a,       // merkle root bitmap A
        merkle_b,       // merkle root bitmap B
        domain,         // domaine choisi
    ));
}
