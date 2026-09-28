# MPC security references

This note is for cryptographic reviewers and contributors assessing the
Tokamak phase 2 design. It does not certify the protocol or a ceremony.

## References

1. Markulf Kohlweiss, Mary Maller, Janno Siim, and Mikhail Volkhov,
   [*Snarky Ceremonies*](https://eprint.iacr.org/2021/219), ASIACRYPT 2021.
   This is the primary reference for contribution and verification structure.
2. Sean Bowe, Ariel Gabizon, and Ian Miers,
   [*Scalable Multi-party Computation for zk-SNARK Parameters in the Random Beacon Model*](https://eprint.iacr.org/2017/1050).
   This provides the two-phase Groth16 ceremony construction.
3. [Filecoin Phase2](https://github.com/filecoin-project/filecoin-phase2/tree/934fe8c6d2df2589644302579838976d070c48a7),
   identified by the [official ceremony record](https://github.com/filecoin-project/phase2-attestations).
   This is the implementation reference for the Filecoin input ecosystem.

## Applicability to Tokamak

These references inform the contribution construction and public verification,
but they do not automatically prove security for Tokamak-specific CRS queries,
the complete Filecoin-to-Tokamak transcript, or intermediate public encodings.
The [phase 2 design record](current-phase2-design.md) identifies the source
mapping, state updates, public evidence, and deferred security analysis.

Point consistency, file hashes, and an accepting SNARK proof do not replace the
proof-of-knowledge checks or a construction-specific security argument. The
deferred analysis is not a statement that the cited theorems apply unchanged to
Tokamak.
