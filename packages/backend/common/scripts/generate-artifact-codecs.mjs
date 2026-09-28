// Generates only the fixed artifact records and codecs needed by current consumers.
import fs from "node:fs/promises";
import path from "node:path";

const common = path.resolve(import.meta.dirname, "..");
const contract = JSON.parse(await fs.readFile(path.join(common, "contracts/univariate-artifact-contract.json"), "utf8"));
const enc = contract.encoding;
const widths = { g1: 2 * enc.baseFieldBytes, g2: 4 * enc.baseFieldBytes, scalar: enc.scalarBytes };
const banner = "// Generated from common/contracts/univariate-artifact-contract.json. Do not edit.\n";
const le = (hex) => [...Buffer.from(hex, "hex")].reverse();
const rustByteString = (bytes) => `b"${bytes.map((byte) => `\\x${byte.toString(16).padStart(2, "0")}`).join("")}"`;
// Only frontend artifacts use the browser container. Proof/preprocess use
// the canonical records generated below, identically for every consumer.
const browser = {
  generatedFrom: "univariate-artifact-contract.json",
  contractVersion: 1,
  owner: "backend",
  artifactKinds: { instance: 1, prover_placement_variables: 5, prover_selector: 8, prover_permutation: 9 },
  artifacts: [],
};
let rust = banner + `const SCALAR_MODULUS_LE: &[u8] = ${rustByteString(le(enc.scalarModulus))};
const BASE_FIELD_MODULUS_LE: &[u8] = ${rustByteString(le(enc.baseFieldModulus))};

fn canonical(bytes: &[u8], scalar: bool) -> bool {
    let modulus = if scalar {
        SCALAR_MODULUS_LE
    } else {
        BASE_FIELD_MODULUS_LE
    };
    bytes.len() == modulus.len() && bytes.iter().rev().cmp(modulus.iter().rev()).is_lt()
}
fn check_field(bytes: &[u8], scalar: bool) -> Result<(), &'static str> {
    let width = if scalar { ${enc.scalarBytes} } else { ${enc.baseFieldBytes} };
    if bytes.chunks_exact(width).all(|c| canonical(c, scalar)) {
        Ok(())
    } else {
        Err("noncanonical artifact field")
    }
}
`;
let ts = banner + `function checkField(bytes: Uint8Array, scalar: boolean): void {
  const width = scalar ? ${enc.scalarBytes} : ${enc.baseFieldBytes};
  const modulus = scalar ? 0x${enc.scalarModulus}n : 0x${enc.baseFieldModulus}n;
  for (let offset = 0; offset < bytes.length; offset += width) {
    let value = 0n;
    for (let i = width - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[offset + i]!);
    if (value >= modulus) throw new Error("noncanonical artifact field");
  }
}
`;
for (const a of contract.artifacts) {
  let offset = 0;
  const fields = a.fields.map(([name, kind]) => {
    if (!(kind in widths) || !/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid artifact field");
    const field = { name, kind, width: widths[kind], offset };
    offset += field.width;
    return field;
  });
  if (new Set(fields.map(f => f.name)).size !== fields.length) throw new Error("Duplicate artifact field");
  rust += `
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ${a.record} {
${fields.map(f => `    pub ${f.name}: [u8; ${f.width}],`).join("\n")}
}
impl ${a.record} {
    pub const BYTE_LENGTH: usize = ${offset};
    pub const FILE_NAME: &'static str = ${JSON.stringify(a.fileName)};
    pub fn decode(bytes: &[u8]) -> Result<Self, &'static str> {
        if bytes.len() != Self::BYTE_LENGTH {
            return Err("invalid artifact byte length");
        }
${fields.map(f => `        check_field(&bytes[${f.offset}..${f.offset + f.width}], ${f.kind === "scalar"})?;`).join("\n")}
        Ok(Self {
${fields.map(f => `            ${f.name}: bytes[${f.offset}..${f.offset + f.width}].try_into().unwrap(),`).join("\n")}
        })
    }
    pub fn encode(&self) -> Result<Vec<u8>, &'static str> {
        let mut bytes = Vec::with_capacity(Self::BYTE_LENGTH);
${fields.map(f => `        check_field(&self.${f.name}, ${f.kind === "scalar"})?;\n        bytes.extend_from_slice(&self.${f.name});`).join("\n")}
        Ok(bytes)
    }
}
`;
  ts += `
export interface ${a.record} {
${fields.map(f => `  ${f.name}: Uint8Array;`).join("\n")}
}
export function decode${a.record}(bytes: Uint8Array): ${a.record} {
  if (bytes.length !== ${offset}) throw new Error("invalid artifact byte length");
${fields.map(f => `  checkField(bytes.subarray(${f.offset}, ${f.offset + f.width}), ${f.kind === "scalar"});`).join("\n")}
  return {
${fields.map(f => `    ${f.name}: bytes.slice(${f.offset}, ${f.offset + f.width}),`).join("\n")}
  };
}
export function encode${a.record}(record: ${a.record}): Uint8Array {
  const bytes = new Uint8Array(${offset});
${fields.map(f => `  if (record.${f.name}.length !== ${f.width}) throw new Error("invalid ${f.name} byte length");\n  checkField(record.${f.name}, ${f.kind === "scalar"});\n  bytes.set(record.${f.name}, ${f.offset});`).join("\n")}
  return bytes;
}
`;
}
const crs = banner + "use super::{UnivariateG1Rkyv, UnivariateG2Rkyv};\n" + Object.entries(contract.crs.records).map(([name, fields]) =>
    `#[derive(Debug, rkyv::Archive, rkyv::Serialize, rkyv::Deserialize)]\npub struct ${name} {\n${fields.map(([f, type]) => `    pub ${f}: ${type},`).join("\n")}\n}`
  ).join("\n") + "\n";
for (const [relative, contents] of [
  ["interface/univariate-crs/src/roles.rs", crs],
  ["contracts/browser-artifact-contract.v1.json", JSON.stringify(browser, null, 2) + "\n"],
  ["interface/src/artifact_bytes.rs", rust],
  ["interface/typescript/artifact-bytes.ts", ts],
  ["../wasm/src/generated/artifact-bytes.generated.ts", ts],
]) {
  const target = path.join(common, relative);
  if (process.argv.includes("--check")) {
    if (await fs.readFile(target, "utf8") !== contents) throw new Error(`Stale artifact codec: ${target}`);
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
}
