use backend_univariate_crs_interface::{archive, ArchivedVerifierKeysRkyv};
use std::{
    env, fs,
    io::{self, Write},
};

/// Export the small verifier archive without mapping the other CRS roles.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args_os()
        .nth(1)
        .ok_or("expected verifier_keys.rkyv path")?;
    let bytes = fs::read(path)?;
    let key = archive::access::<ArchivedVerifierKeysRkyv, archive::rancor::Error>(&bytes)?;
    let contract: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../common/contracts/univariate-crs-chunk-contract.json"
    ))?;
    if Some(key.schema_id.as_str()) != contract["sourceSchemaId"].as_str() {
        return Err("unsupported verifier CRS schema".into());
    }
    let mut out = io::stdout().lock();
    for point in [&key.one_g1, &key.xi_g1, &key.psi_g1] {
        out.write_all(&point.x)?;
        out.write_all(&point.y)?;
    }
    for point in [&key.one_g2, &key.tau_g2, &key.tau_k_g2, &key.delta_g2] {
        out.write_all(&point.x)?;
        out.write_all(&point.y)?;
    }
    Ok(())
}
