	use methods::{METHODS_GUEST_ELF, METHODS_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv};
use sha2::{Sha256, Digest};
use std::fs;
use wasmparser::{Parser, Payload, Operator};

// --- Types partagés avec le Guest ---
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

// --- Logique d'extraction pour le Host (calcul du hash public) ---
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

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

fn main() {
    println!("=== ZTB V4.3: Lancement de l'Attaque Simulée ===");

    // 1. Charger les fichiers cibles
    let target_bytes = fs::read("wasm_tests/happy_c1a.wasm").expect("WASM manquant");
    let baseline_a_vec = fs::read("baseline_a.bin").expect("baseline A manquante");
    let baseline_b_vec = fs::read("baseline_b.bin").expect("baseline B manquante");

    // 2. Calculer les inputs publics (Les Hashs d'engagement)
    let expected_cid = sha256_bytes(&target_bytes);
    
    let mut props = extract_static_props(&target_bytes);
    props.dedup_by_key(|p| p.condition_offset);
    let expected_ph = sha256_bytes(&bincode::serialize(&props).unwrap());
    
    let baseline_hash_a = sha256_bytes(&baseline_a_vec);
    let baseline_hash_b = sha256_bytes(&baseline_b_vec);

    // 3. Config Financière (Domaine Axiomatique)
    let financial_config = FinancialConfig {
        authorized_func_indices: vec![0, 1],
        max_delta_pct_of_before: 20,
    };
    let config_hash = sha256_bytes(&bincode::serialize(&financial_config).unwrap());

    // 4. Payload du Hacker: On appelle 'withdraw' avec 200 pour déclencher le Trap
    let payload = vec![
        Step {
            function_name: "withdraw".to_string(),
            args: vec![ZtbWasmValue::I32(200)],
        }
    ];

    let domain: u8 = 0; // FINANCIAL
    let mode_val: u8 = 1; // RELAXED (on ne force pas la nouveauté C3 pour ce test)

    println!("[1/3] Construction de l'environnement zkVM...");
    let env = ExecutorEnv::builder()
        // Variables Privées
        .write(&target_bytes).unwrap()
        .write(&domain).unwrap()
        .write(&mode_val).unwrap()
        .write(&financial_config).unwrap()
        .write(&baseline_a_vec).unwrap()
        .write(&baseline_b_vec).unwrap()
        .write(&payload).unwrap()
        // Variables Publiques
        .write(&expected_cid).unwrap()
        .write(&expected_ph).unwrap()
        .write(&baseline_hash_a).unwrap()
        .write(&baseline_hash_b).unwrap()
        .write(&config_hash).unwrap()
        .build()
        .unwrap();

    println!("[2/3] Génération de la Preuve (Mode Dev)...");
    let prover = default_prover();
    let prove_info = prover.prove(env, METHODS_GUEST_ELF).expect("Le Guest a paniqué (Preuve rejetée)");
    let receipt = prove_info.receipt;

    println!("[3/3] Vérification de la Preuve & Lecture du Journal...");
    receipt.verify(METHODS_GUEST_ID).unwrap();

    // Décodage du journal à 15 champs (Output de l'Oracle)
    let (
        _out_cid, _out_domain, _out_ph, _out_hash_a, _out_hash_b, _out_config_hash,
        _out_payload_hash, _out_payload_len,
        out_c1a, out_c1b, out_c2, out_c3, out_new_transitions, out_mode, out_verdict_str
    ): (
        [u8; 32], u8, [u8; 32], [u8; 32], [u8; 32], [u8; 32], [u8; 32], u32,
        bool, bool, bool, bool, u32, u8, [u8; 8]
    ) = receipt.journal.decode().unwrap();

    let verdict = std::str::from_utf8(&out_verdict_str).unwrap();

    println!("--------------------------------------------------");
    println!("🚀 EXPLOIT VALIDÉ ET PROUVÉ AVEC SUCCÈS !");
    println!("C1a (Trap déclenché) : {}", out_c1a);
    println!("C1b (Validateur)     : {}", out_c1b);
    println!("C2  (Domaine)        : {}", out_c2);
    println!("C3  (Nouveauté)      : {}", out_c3);
    println!("Nouvelles Trans.     : {}", out_new_transitions);
    println!("Verdict Final        : {}", verdict);
    println!("Mode                 : {}", if out_mode == 0 { "STRICT (100% Prime)" } else { "RELAXED (70% Prime)" });
    println!("--------------------------------------------------");
println!("GUEST_IMAGE_ID : {:?}", METHODS_GUEST_ID);
}
