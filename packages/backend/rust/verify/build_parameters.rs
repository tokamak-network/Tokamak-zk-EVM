use std::io;

/// Derive verifier constants only from producer-owned setup parameters.
pub fn read(setup_bytes: &[u8], subcircuit_bytes: &[u8]) -> io::Result<(u64, u64, u64)> {
    use crate::normalized_library::{
        NormalizedSetupParams, NormalizedSubcircuitInfo, NormalizedSubcircuitLibrary,
    };

    let setup: NormalizedSetupParams = serde_json::from_slice(setup_bytes)?;
    let subcircuits: Box<[NormalizedSubcircuitInfo]> = serde_json::from_slice(subcircuit_bytes)?;
    let invalid = |message: String| io::Error::new(io::ErrorKind::InvalidData, message);
    let library = NormalizedSubcircuitLibrary::new(setup, subcircuits)
        .map_err(|error| invalid(error.to_string()))?;
    let n_a = library
        .setup
        .n
        .checked_mul(library.setup.s)
        .ok_or_else(|| invalid("N_A overflow".into()))?;
    let n_c = library
        .setup
        .m_b
        .checked_mul(library.setup.s)
        .ok_or_else(|| invalid("N_C overflow".into()))?;
    let l_free = library.public.free_public_len();
    for (name, size) in [("N_A", n_a), ("N_C", n_c), ("L_FREE", l_free)] {
        // The BLS12-381 scalar field supports radix-two domains up to 2^32.
        if !size.is_power_of_two() || size > (1usize << 32) {
            return Err(invalid(format!(
                "{name} must be a power of two at most 2^32"
            )));
        }
    }
    Ok((n_a as u64, n_c as u64, l_free as u64))
}

pub fn generate(setup_bytes: &[u8], subcircuit_bytes: &[u8]) -> io::Result<String> {
    let (n_a, n_c, l_free) = read(setup_bytes, subcircuit_bytes)?;
    Ok(format!(
        "// Generated from the selected subcircuit library at build time.\n\
         pub const N_A: u64 = {n_a};\n\
         pub const N_C: u64 = {n_c};\n\
         pub const L_FREE: u64 = {l_free};\n"
    ))
}
