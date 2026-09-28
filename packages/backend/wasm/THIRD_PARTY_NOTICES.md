# Third-Party Notices

This document is for application developers and distributors who consume
`@tokamak-zk-evm/snark-browser-compat`. It distinguishes this package's source
from dependencies that remain external npm packages.

## External npm dependencies

| Package | Declared version | Declared license |
| --- | --- | --- |
| `@noble/hashes` | `^1.8.0` | MIT |
| `@tokamak-zk-evm/subcircuit-library` | `3.0.0` | MIT OR Apache-2.0 |
| `ffjavascript` | `^0.3.1` | GPL-3.0 |

The installed npm packages carry their own license files. Transitive
dependencies of ffjavascript may impose additional obligations. This package's
`MIT OR Apache-2.0` license does not override dependency licenses.

## Generated Tokamak material

The published prover includes setup parameters, packed R1CS data, and
subcircuit metadata generated from the selected Tokamak subcircuit library.
These sources follow the repository's `MIT OR Apache-2.0` policy. The complete
license texts are in `LICENSE-MIT` and `LICENSE-APACHE`.

Application distributors remain responsible for reviewing the licenses and
source-distribution obligations of their complete build.
