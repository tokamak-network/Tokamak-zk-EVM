use backend_interface::{PreprocessBytes, ProofBytes};

#[test]
fn fixed_layout_roundtrips_and_rejects_noncanonical_fields() {
    assert_eq!(ProofBytes::BYTE_LENGTH, 1184);
    assert_eq!(PreprocessBytes::BYTE_LENGTH, 384);
    let mut bytes = vec![0; ProofBytes::BYTE_LENGTH];
    // Infinity is (0, 0); scalars zero and one need no arithmetic dependency.
    bytes[960] = 1;
    let record = ProofBytes::decode(&bytes).unwrap();
    assert_eq!(record.s_c[0], 1);
    assert_eq!(record.encode().unwrap(), bytes);
    assert!(ProofBytes::decode(&bytes[..1183]).is_err());
    bytes.push(0);
    assert!(ProofBytes::decode(&bytes).is_err());
    bytes.pop();
    bytes[..48].fill(255);
    assert!(ProofBytes::decode(&bytes).is_err());
    bytes[..48].fill(0);
    bytes[960..992].fill(255);
    assert!(ProofBytes::decode(&bytes).is_err());
    let mut record = record;
    record.r_plus.fill(255);
    assert!(record.encode().is_err());
    let bytes = vec![0; PreprocessBytes::BYTE_LENGTH];
    assert_eq!(
        PreprocessBytes::decode(&bytes).unwrap().encode().unwrap(),
        bytes
    );
    assert!(PreprocessBytes::decode(&bytes[..383]).is_err());
}
