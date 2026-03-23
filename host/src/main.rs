use methods::{METHODS_GUEST_ELF, METHODS_GUEST_ID};
use risc0_zkvm::{default_prover, ExecutorEnv};
use sha2::{Sha256, Digest};
use std::fs;

fn sha256(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

fn run_test(
    name:       &str,
    wasm:       &[u8],
    baseline_a: &[u8],
    baseline_b: &[u8],
    domain:     u8,
    expect_ok:  bool,
) {
    print!("  [{name}] ... ");
    let cid: [u8; 32] = sha256(wasm);
    let env = ExecutorEnv::builder()
        .write(&wasm.to_vec()).unwrap()
        .write(&baseline_a.to_vec()).unwrap()
        .write(&baseline_b.to_vec()).unwrap()
        .write(&domain).unwrap()
        .write(&cid).unwrap()
        .build().unwrap();
    let result = default_prover().prove(env, METHODS_GUEST_ELF);
    match (result, expect_ok) {
        (Ok(info), true) => {
            info.receipt.verify(METHODS_GUEST_ID).unwrap();
            let (_, _, density, total, _, _, _, _, _):
                ([u8;32],[u8;32],u32,u32,[u8;32],[u8;32],[u8;32],[u8;32],u8)
                = info.receipt.journal.decode().unwrap();
            println!("PASS  ({} assertions, {} transitions)", density, total);
        }
        (Err(_), false) => println!("PASS  (rejeté comme attendu)"),
        (Ok(_),  false) => println!("FAIL  (aurait dû être rejeté)"),
        (Err(e), true)  => println!("FAIL  {}", e),
    }
}

fn main() {
    let a = fs::read("baseline_a.bin").expect("baseline_a.bin manquant");
    let b = fs::read("baseline_b.bin").expect("baseline_b.bin manquant");

    println!();
    println!("=== ZTB — Test Suite Sprint 1 ===");
    println!();

    let w = fs::read("wasm_tests/happy_c1a.wasm").unwrap();
    run_test("happy_c1a      ", &w, &a, &b, 2, true);

    let w = fs::read("wasm_tests/happy_c2.wasm").unwrap();
    run_test("happy_c2       ", &w, &a, &b, 2, true);

    let w = fs::read("wasm_tests/happy_reentrance.wasm").unwrap();
    run_test("happy_reentrance", &w, &a, &b, 2, true);

    let w = fs::read("wasm_tests/rejection.wasm").unwrap();
    run_test("rejection      ", &w, &a, &b, 2, true);

    // Test integrity : CID du fichier original mais WASM modifié
    let original_cid = sha256(&fs::read("wasm_tests/happy_c1a.wasm").unwrap());
    let tampered     = fs::read("wasm_tests/integrity.wasm").unwrap();
    print!("  [integrity      ] ... ");
    let env = ExecutorEnv::builder()
        .write(&tampered).unwrap()
        .write(&a).unwrap()
        .write(&b).unwrap()
        .write(&2u8).unwrap()
        .write(&original_cid).unwrap()
        .build().unwrap();
    match default_prover().prove(env, METHODS_GUEST_ELF) {
        Err(_) => println!("PASS  (CID mismatch détecté)"),
        Ok(_)  => println!("FAIL  (CID falsifié non détecté)"),
    }

    println!();
    println!("=== Sprint 1 — tous les tests terminés ===");
}
