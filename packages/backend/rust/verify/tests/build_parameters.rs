#[path = "../build_parameters.rs"]
mod build_parameters;
#[allow(dead_code)]
#[path = "../../build-support/normalized_library.rs"]
mod normalized_library;

fn setup() -> serde_json::Value {
    serde_json::json!({
        "n": 1024,
        "m": 1024,
        "m_b": 512,
        "t": 4,
        "s": 256,
        "publicWirePhases": [{
            "name": "free",
            "region": "free",
            "subcircuitIds": [0, 1]
        }]
    })
}

fn subcircuits() -> serde_json::Value {
    serde_json::json!([
        {
            "id": 0, "name": "buffer-0", "Nwires": 1024, "NrealWires": 101,
            "Nconsts": 1, "Out_idx": [1, 100], "In_idx": [101, 0],
            "Wiring_idx": [0, 101], "Public_idx": [1, 100],
            "Internal_idx": [512, 0], "bufferDirection": "out", "publicPhase": "free"
        },
        {
            "id": 1, "name": "buffer-1", "Nwires": 1024, "NrealWires": 59,
            "Nconsts": 1, "Out_idx": [1, 58], "In_idx": [59, 0],
            "Wiring_idx": [0, 59], "Public_idx": [1, 58],
            "Internal_idx": [512, 0], "bufferDirection": "out", "publicPhase": "free"
        }
    ])
}

fn generate(setup: &serde_json::Value) -> std::io::Result<String> {
    build_parameters::generate(
        &serde_json::to_vec(setup).unwrap(),
        &serde_json::to_vec(&subcircuits()).unwrap(),
    )
}

#[test]
fn derives_only_the_three_runtime_constants() {
    let source = generate(&setup()).unwrap();
    assert!(source.contains("N_A: u64 = 262144;"));
    assert!(source.contains("N_C: u64 = 131072;"));
    assert!(source.contains("L_FREE: u64 = 256;"));
    assert_eq!(source.matches("pub const").count(), 3);
    let mut changed = setup();
    changed["s"] = 512.into();
    let updated = generate(&changed).unwrap();
    assert!(updated.contains("N_A: u64 = 524288;"));
    assert!(updated.contains("N_C: u64 = 262144;"));
}

#[test]
fn rejects_invalid_metadata_without_defaults() {
    for (name, value) in [
        ("n", serde_json::Value::Null),
        ("n", serde_json::json!("1024")),
        ("n", serde_json::json!(-1)),
        ("n", serde_json::json!(1.5)),
        ("n", serde_json::json!(u64::MAX)),
        ("n", serde_json::json!(1u64 << 32)),
        ("s", serde_json::json!(0)),
        ("m_b", serde_json::json!(0)),
        ("m_b", serde_json::json!(513)),
        ("publicWirePhases", serde_json::Value::Null),
    ] {
        let mut invalid = setup();
        invalid[name] = value;
        assert!(generate(&invalid).is_err(), "{invalid}");
    }
    assert!(build_parameters::generate(b"not JSON", b"[]").is_err());
}

#[test]
fn verifier_contains_build_time_constants() {
    mod parameters {
        include!(concat!(env!("OUT_DIR"), "/verifier_parameters.rs"));
    }
    assert!(parameters::N_A.is_power_of_two());
    assert!(parameters::N_C.is_power_of_two());
    assert!(parameters::L_FREE.is_power_of_two());
}
