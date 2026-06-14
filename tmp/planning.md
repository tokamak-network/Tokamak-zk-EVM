# Seminar Deck Creation Plan: Tokamak zk-EVM Replay-Dedicated Circuit Derivation

## Audience

The audience is graduate students who are studying zero-knowledge proofs and SNARKs at an introductory level. They should be assumed to know basic ideas such as arithmetic circuits, witnesses, public inputs, and the prover-verifier split, but not the Tokamak zk-EVM implementation or the field-programmable SNARK construction.

## Goal

Create seminar presentation material explaining how Tokamak zk-EVM derives a replay-dedicated circuit from a subcircuit library when an Ethereum program execution replay is given.

The presentation must also explain which Ethereum contracts, or more precisely which supported contract-entry transaction classes, can reuse one trusted replay-dedicated circuit output across different successful transactions. This point should be treated carefully: Tokamak zk-EVM should not be presented as applying to all smart contracts. The admissible case is a contract entry whose successful execution replays always have the same placement topology and compatible public/private interface layout, even when witness values change.

## Presentation Language

The seminar deck, slide text, speaker notes, diagrams, and audience-facing examples must be written in Korean. Technical terms may keep standard English forms when Korean translation would reduce precision or make the material harder for graduate students to connect with SNARK literature.

## Slide Design Constraints

- No text in any slide may be smaller than 14 pt.
- This minimum applies to titles, body text, labels, captions, chart annotations, table cells, footnotes, source labels, and diagram text.
- If a table, source note, or diagram cannot fit at 14 pt or larger, reduce the amount of visible text, split the content across slides, or move details into speaker notes.
- Speaker notes may contain fuller explanations, but audience-facing slide text must remain readable without relying on dense small print.

## Scope Boundaries

- Theory and concepts come first; repository details should support the explanation rather than dominate it.
- The deck should explain the field-programmable circuit model from the paper before mapping it to Tokamak zk-EVM artifacts.
- The repository should be used as an implementation reference for package names and workflow boundaries, not as the main source of slide-level detail.
- The deck should avoid source-code walkthroughs except where a short implementation anchor clarifies an abstract concept.
- Excessive detail is prohibited in audience-facing slides. Prefer high-level proof-system objects over concrete file names, payload field lists, schemas, class names, or package-internal APIs.
- When explaining the `synthesizer`, describe its inputs at the level of `subcircuit library`, Solidity-compiled EVM bytecode, and `public/private instance`, and its outputs at the level of `witness` and `permutation`.
- Detailed artifact names such as generated JSON filenames may be kept in speaker notes or internal planning references only when they clarify implementation mapping; they should not be central slide content.
- Terminology slides must define only the terms needed for the next few slides.
- No claim should imply that every input to the same EVM bytecode yields the same derived circuit. The deck must state the required invariance assumptions explicitly.
- The deck must state that failed transaction paths are out of scope for the reusable-circuit admissibility discussion.
- The deck must state that input-dependent loops or conditionals are not automatically disallowed; they are disallowed only when successful executions can vary the placement topology.

## Primary Sources

### Academic Source

- `~/downloads/2024-507.pdf`
- Paper title: "An Efficient SNARK for Field-Programmable and RAM Circuits"
- Authors: Jehyuk Jang and Jamie Judd
- Use this paper as the authority for conceptual definitions, theory, and explanatory language.
- Main concepts to use:
  - SNARKs for verifiable computation of changing targets.
  - The problem of circuit-specific preprocessing for RAM-like computation.
  - Field-programmable circuit derivation from a fixed subcircuit library.
  - A derived circuit as subcircuit placement plus a wire map.
  - Separation between arithmetic constraints inside subcircuits and copy constraints between subcircuits.
  - The wire map as a permutation over connecting wires.
  - A system split between a fixed reusable circuit basis and execution-specific program data.

### Repository Sources

Use repository sources only to map the paper's conceptual model onto Tokamak package names, files, artifacts, and workflow boundaries. Do not use repository documentation as the primary source for theoretical definitions.

- `README.md`
  - Describes the monorepo as a stack for turning Tokamak L2 transaction execution into zk-SNARK proof artifacts.
  - Lists `qap-compiler` and `synthesizer` packages under frontend compilers, and `prover` and `verify` under backend packages.
- `packages/frontend/qap-compiler/scripts/compile.sh`
  - Lists the compiled subcircuits and confirms that the compiled circuits are composable library components, not one standalone top-level proof circuit.
- `packages/frontend/qap-compiler/README.md`
  - Describes the published Tokamak zk-EVM Subcircuit Library artifact surface.
- `packages/frontend/qap-compiler/docs/consumer-integration.md`
  - Describes how the subcircuit library is consumed by the synthesizer and backend.
- `packages/frontend/qap-compiler/docs/subcircuit-library-generation-and-release.md`
  - Describes maintainer-side generation and published library artifacts.
- `packages/frontend/synthesizer/README.md`
  - Describes the shared input and output model for transaction synthesis.
- `packages/frontend/synthesizer/docs/architecture.md`
  - Describes the shared synthesis layers and generated artifacts.
- `packages/frontend/synthesizer/docs/execution-flow.md`
  - Describes input preparation, synthesis execution, artifact generation, and adapter output.
- `packages/frontend/synthesizer/docs/transaction-flow.md`
  - Describes event-driven opcode translation, call-context handling, and current opcode support boundaries.
- `packages/frontend/synthesizer/docs/output-files.md`
  - Describes the implementation mapping behind the high-level synthesizer outputs.
- `packages/frontend/synthesizer/core/src/app/synthesize.ts`
  - Shows the end-to-end runtime: reconstruct state, create transaction, run `synthesizeTX()`, capture final state, and generate circuit artifacts.
- `packages/frontend/synthesizer/core/src/synthesizer/synthesizer.ts`
  - Shows VM event hooks, call-depth context creation, child-to-parent return-data transfer, and storage finalization.
- `packages/frontend/synthesizer/core/src/synthesizer/handlers/stateManager.ts`
  - Shows per-depth context state for stack, memory, caller, callee, calldata, return data, and result data.
- `packages/frontend/synthesizer/core/src/circuitGenerator/circuitGenerator.ts`
  - Shows that final artifacts correspond to witness-oriented data, public instance data, and a permutation.
- `packages/frontend/synthesizer/core/src/circuitGenerator/handlers/variableGenerator.ts`
  - Shows placement-to-subcircuit witness generation, output checks, public instance extraction, buffer-size checks, and EVM-wire-to-Circom-wire conversion.
- `packages/frontend/synthesizer/core/src/circuitGenerator/handlers/permutationGenerator.ts`
  - Shows construction and validation of permutation groups for copy constraints.
- `packages/frontend/synthesizer/core/src/subcircuit/configuredTypes.ts`
  - Shows the configured subcircuit names, buffers, and opcode-to-subcircuit mapping.
- `packages/frontend/synthesizer/core/src/subcircuit/libraryTypes.ts`
  - Shows the metadata model: setup parameters, global wire list, frontend configuration, and subcircuit information.
- `packages/backend/README.md`
  - Describes backend setup, preprocess, prove, and verify flows, including the fact that backend binaries consume the subcircuit library and synthesizer outputs.

### External Solidity Sources For The `mintNotes1` Example

Use these sources only for the private-state `mintNotes1` example. The local synthesizer fixture is in this repository, but the Solidity source currently lives in the related contracts repository.

- `https://github.com/tokamak-network/Tokamak-zk-EVM-contracts`
- `https://raw.githubusercontent.com/tokamak-network/Tokamak-zk-EVM-contracts/main/packages/apps/private-state/src/PrivateStateController.sol`
- `https://raw.githubusercontent.com/tokamak-network/Tokamak-zk-EVM-contracts/main/packages/apps/private-state/src/L2AccountingVault.sol`
- Local fixture:
  - `packages/frontend/synthesizer/examples/privateState/mintNotes/mintNotes1/`
- Local calldata helper:
  - `packages/frontend/synthesizer/examples/privateState/utils.ts`

Implementation findings from the executed fixture should be used as speaker-note support, not as dense slide content.

### EVM Opcode Reference Source For Backup Mapping

Use `evm.codes` as the external opcode catalog for the opcode-to-subcircuit backup material.

- `https://www.evm.codes/`, accessed 2026-06-14.
- `https://github.com/duneanalytics/evm.codes`, accessed 2026-06-14.
- `https://raw.githubusercontent.com/duneanalytics/evm.codes/main/opcodes.json`, accessed 2026-06-14.

Use the Tokamak repository as the authority for how those opcodes are currently synthesized. The backup table must clearly distinguish:

- opcodes that map directly to arithmetic subcircuits;
- opcodes whose handling is a composition of buffers, memory reconstruction, context tracking, and optional helper placements;
- opcodes that are unsupported or intentionally rejected.

### Market And Funding Sources For Opening Visuals

Use these sources only for the opening motivation. They should not be used to claim Tokamak zk-EVM market share.

- L2BEAT scaling TVS summary, accessed 2026-06-14:
  - `https://l2beat.com/scaling/tvs`
  - Source values to cite:
    - Ethereum scaling projects tracked by L2BEAT: total TVS `~$39.31B`.
    - Rollups tracked by L2BEAT: TVS `~$32.78B`.
    - Selected ZK scaling projects from the same table: Starknet `~$418.20M`, Linea `~$351.40M`, ZKsync Era `~$233.95M`, Scroll `~$43.53M`, Loopring `~$8.63M`.
- L2BEAT privacy summary, accessed 2026-06-14:
  - `https://l2beat.com/privacy/summary`
  - Source values to cite:
    - Tornado Cash: TVL `~$385.40M`, 30D volume `~$120.08M`.
    - Railgun: TVL `~$76.46M`, 30D volume `~$49.68M`.
    - Privacy Pools: TVL `~$7.91M`, 30D volume `~$4.14M`.
    - Combined tracked privacy-protocol TVL from these three rows: `~$469.77M`.
    - Combined tracked 30D privacy volume from these three rows: `~$173.90M`.
- Disclosed scaling-side funding and acquisition sources:
  - Matter Labs / ZKsync: CoinDesk reported total funding of `$458M` after the 2022 Series C: `https://www.coindesk.com/tech/2022/11/16/matter-labs-nets-200m-to-build-zksync-ethereum-scaling-platform`.
  - StarkWare / Starknet: sources report approximately `$261M` total funding and a `$100M` Series D at an `$8B` valuation: `https://www.calcalistech.com/ctechnews/article/hyms9oiw5` and `https://startupintros.com/orgs/starkware-industries`.
  - Scroll: The Block reported that a `$50M` round brought total funding to `$83M`: `https://www.theblock.co/post/217340/ethereum-scaling-scroll-50-million-funding-round-1-8-billion-valuation`.
  - Taiko: PR Newswire reported `US$37M` total raised across three rounds: `https://www.prnewswire.com/news-releases/taiko-raises-us37m-from-top-tier-vcs-ahead-of-mainnet-launch-302077780.html`.
  - Polygon zero-knowledge scaling acquisitions: CoinDesk reported Mir at `$400M` and Hermez at `$250M`: `https://www.coindesk.com/business/2021/12/09/polygon-acquires-ethereum-scaling-startup-mir-for-400m-in-matic`.
- Disclosed privacy-side funding sources:
  - Aztec: Aztec announced a `$17M` Series A and a `$100M` Series B for Ethereum privacy/encrypted Ethereum: `https://aztec.network/blog/aztec-network-raises-17-million-series-a-from-paradigm-to-bring-programmable-privacy-to-web3` and `https://medium.com/aztec-protocol/aztec-raises-100-million-to-build-encrypted-ethereum-dd5062ba949c`.
  - Nocturne Labs: CoinDesk reported a `$6M` seed round for privacy on-chain accounts in the Ethereum ecosystem: `https://www.coindesk.com/tech/2023/10/25/bain-capital-polychain-lead-6m-funding-round-for-privacy-protocol-firm-nocturne-labs`.
  - Nucleo: Global FinTech Series reported a `$4M` seed round for private, non-custodial, auditable multisig on Ethereum: `https://globalfintechseries.com/blockchain/nucleo-raises-4-million-seed-round-to-build-privacy-crypto-infrastructure-for-organizations`.
  - 0xbow / Privacy Pools: GlobeNewswire reported a `$3.5M` seed round after Ethereum Foundation Privacy Pools integration: `https://www.globenewswire.com/news-release/2025/11/18/3190435/0/en/0xbow-closes-3-5m-round-for-compliant-crypto-privacy-technology-following-ethereum-foundation-integration.html`.
- Recent privacy-reemergence sources:
  - Ethereum Foundation privacy commitment: EF states that it is expanding privacy efforts and forming a Privacy cluster: `https://blog.ethereum.org/2025/10/08/privacy-commitment`.
  - Ethereum Foundation Privacy Cluster leadership announcement: `https://blog.ethereum.org/2025/10/01/privacy-cluster-leads`.
  - PSE roadmap for 2025 and beyond: PSE frames privacy as a first-class citizen across Ethereum: `https://pse.dev/blog/pse-roadmap-2025`.
  - Kohaku SDK coverage: The Defiant reported that the EF Kohaku Initiative released an SDK for wallet-level privacy integration using shielded pool protocols such as Railgun, Tornado Cash, and Privacy Pools: `https://thedefiant.io/news/blockchains/ethereum-foundation-kohaku-sdk-privacy-wallet-integration-bb4t52`.

### Comparative Ethereum ZK Execution-Proof Sources

Use these sources for the short bridge section between the NP-verification discussion and the Tokamak-specific circuit derivation. The goal is not to audit many projects, but to show through Scroll, Linea, and Aztec how execution becomes constrained proof input in prominent Ethereum ZK systems.

Default selection for the main deck:

1. Scroll
2. Linea / Lineth
3. Aztec

Do not include other projects in the main slide. Extra examples should stay in speaker notes or be omitted.

- Scroll zkEVM overview:
  - `https://docs.scroll.io/en/technology/zkevm/zkevm-overview/`
  - Key points to cite:
    - EVM execution can be viewed as a state transition function from initial state and transactions to a final state.
    - Execution is broken into a step-by-step trace.
    - The trace serves as the witness.
    - The proof checks opcode correctness, ordering, and agreement between initial and final state.
- Linea specification, current monorepo, and glossary:
  - `https://github.com/LFDT-Lineth/lineth-monorepo`
  - `https://github.com/Consensys/linea-specification`
  - `https://docs.linea.build/protocol/reference/zero-knowledge-glossary`
  - Key points to cite:
    - The former `linea-specification` repository was archived on 2026-06-08 and points readers to the current monorepo, so current slide source labels should prefer `lineth-monorepo`.
    - Linea's constraint system captures the logic of valid EVM executions.
    - The tracer produces traces that the constraint system applies to and that serve as prover inputs.
    - The execution trace records transaction-level execution events used to construct a validity proof.
- Aztec overview and circuit documentation:
  - `https://docs.aztec.network/`
  - `https://docs.aztec.network/developers/overview`
  - `https://docs.aztec.network/developers/docs/foundational-topics/advanced/circuits/private_kernel`
  - `https://docs.aztec.network/developers/docs/foundational-topics/advanced/circuits/rollup_circuits`
  - Key points to cite:
    - Aztec is a privacy-first Layer 2 on Ethereum, but it is not EVM compatible.
    - Aztec supports private and public smart-contract execution with private and public state.
    - Private functions execute and prove on the user's device so private inputs remain private.
    - The private kernel recursively processes private function calls, accumulating side effects and validation requests into a proof of private execution correctness.
    - Rollup circuits aggregate private-kernel and AVM execution proofs, validate state transitions, and produce the final proof submitted to L1.
- Optional secondary reference for visual classification only:
  - L2BEAT zk catalog pages may be used to label systems at a high level, but technical claims should rely on the official docs or repositories above.

## Opening Evidence Visual

The opening should be short: at most two slides before the technical transition. It should motivate EVM execution proofs without turning the seminar into a market report.

### Opening Narrative Claim

Do not claim that the Ethereum ZKP market has fully shifted from scalability to privacy. The sourced data does not support that stronger claim: scaling-oriented ZK systems still dominate by TVS and disclosed capital.

Use this framing:

> Ethereum ZKP adoption has been led by scalability, especially rollups and zkEVM systems. Recently, privacy has re-emerged as a distinct core application area. Both directions need the same technical foundation: an EVM execution must be turned into a precise arithmetic statement.

### Single Evidence Slide

Use one compact visual with two columns and a short source footnote.

| Direction | Evidence to show | Interpretation |
| --- | --- | --- |
| Scalability | L2BEAT scaling total TVS `~$39.31B`, rollup TVS `~$32.78B`, selected ZK scaling examples such as Starknet, Linea, ZKsync Era, Scroll, and Loopring. | Scaling is still the larger deployed-value and capital-formation story. |
| Privacy | L2BEAT privacy examples: Tornado Cash, Railgun, and Privacy Pools; combined tracked TVL `~$469.77M`, combined 30D volume `~$173.90M`; EF Privacy Cluster, PSE roadmap, Kohaku SDK, and Aztec/0xbow funding. | Privacy is not larger, but it is becoming a renewed Ethereum roadmap and product priority. |

Speaker note:

- TVS, TVL, volume, funding, acquisition value, and valuation are different metrics. Do not put them on one numeric axis.
- Funding and acquisition numbers may be mentioned orally or in a tiny side annotation, but they should not receive a separate slide unless the user explicitly asks for a market-focused deck.
- The transition sentence should be: "Whether the target is scalability or privacy, the engineering problem we need now is the same: derive a verifiable arithmetic statement from an EVM replay."

## Core Thesis

Tokamak zk-EVM does not derive a circuit by compiling the whole EVM program from scratch for every replay. Instead, it starts from a fixed library of precompiled subcircuits. A replay determines which subcircuit copies are placed, what values pass through their interface wires, which public instance values are exposed, and how interface wires are connected by a permutation. The resulting circuit is replay-dedicated because it is specialized to the trace shape of that replay, while the expensive subcircuit definitions remain reusable.

## Conceptual Model To Teach

1. A subcircuit library is a fixed set of small arithmetic constraint systems.
2. A replay is a deterministic execution record of a program under a concrete state and input.
3. A synthesizer maps replay events to subcircuit placements.
4. Each placement is an instance of a subcircuit with input wires, output wires, and internal witness wires.
5. Arithmetic constraints check that each placement satisfies its local subcircuit relation.
6. Copy constraints check that values passed between placements are consistent.
7. The copy constraints are represented by a wire map/permutation.
8. The derived circuit is therefore determined by placement plus wiring, not by generating a new primitive circuit language from scratch.

## Planned Deck Structure

### 1. Motivation: Why Prove EVM Execution With ZKP?

- Open with the application-level question before introducing circuit derivation: why would anyone want to prove an EVM execution instead of simply asking every verifier to re-execute it?
- Frame the answer around two practical goals:
  - scalability: many executions can be checked through compact proofs, reducing repeated verifier work and enabling rollup-style validation;
  - privacy: execution correctness can be argued while hiding selected witness data, depending on the statement and public-input design.
- Use only one evidence slide for market and funding context. It should support the motivation, not become a separate topic.
- Make the transition from application to mechanism:
  - ZKP makes EVM execution verifiable;
  - verifiable EVM execution requires an arithmetic statement;
  - Tokamak zk-EVM needs a way to derive that statement from a concrete replay.

### 2. Why Replay-Dedicated Circuits Exist

- Explain the technical validation problem: many nodes want confidence in execution without re-executing every step.
- Develop the NP-language perspective before discussing EVM traces:
  - A SNARK statement is an NP-style verification problem: given a public instance, the prover claims that there exists a witness satisfying the circuit.
  - The circuit is not designed to search for the witness or discover the answer. It is designed to verify a claimed answer efficiently once the answer, execution trace, or witness has already been produced.
  - For ordinary static computations, it is easy to forget this distinction because the verification circuit often looks like a direct encoding of the computation.
  - For RAM/EVM execution, the found answer includes more than output values: it includes a concrete execution trace, with branch choices, loop counts, memory/storage accesses, call structure, and intermediate dataflow.
  - Therefore, if different inputs lead the same program to different found traces, the verification problem can require a different placement and wiring pattern. This is why "the same program" does not automatically imply "the same derived circuit."
- Explain why RAM-like execution is difficult for circuit-specific SNARKs: the executed instruction trace can depend on input, and the verification circuit may be specialized to that already-found trace.
- Contrast three circuit-generation strategies:
  - compile a fresh circuit for every replay;
  - use a fully universal machine circuit;
  - use a field-programmable subcircuit-library approach.
- Position Tokamak zk-EVM as using the third idea.

### 3. How Selected Ethereum ZK Projects Turn Execution Into Proof Inputs

- Insert this section before the Tokamak-specific details so the audience first sees the broader design space.
- State the common problem:
  - an executor has already produced a concrete execution object;
  - the proving system must decide which constrained object verifies that execution;
  - the circuit or arithmetization checks the already-produced trace or batch, rather than searching for an execution.
- Present only these three selected projects, not a broad project survey:
  - Scroll: starts from the EVM state-transition view, expands execution into an ordered opcode trace, treats the trace as witness data, and proves step correctness, ordering, and start/end state agreement.
  - Linea: uses a tracer to produce execution traces; constraints capture valid EVM execution logic and are applied to those traces as prover inputs.
  - Aztec: is not an EVM-compatible replay system, so use it as a privacy-focused contrast; private execution is proven through private function proofs and recursive private-kernel circuits, then aggregated with AVM execution in rollup circuits for L1 verification.
- Explain why these examples were selected:
  - they are current, visible Ethereum ZK systems;
  - they expose enough official documentation to support a clean conceptual comparison;
  - together they show two EVM-replay-oriented designs and one privacy-first execution-proof design without turning the talk into a market survey.
- Use one comparison table with three columns:
  - project;
  - "what becomes the proof input";
  - "what constrains it."
- Keep this section conceptual. Do not introduce Tokamak placement variables, permutations, or file paths yet.
- Bridge to Tokamak:
  - the shared theme is verifying an already-produced execution object;
  - Tokamak's subcircuit-library approach is a different point in the same design space;
  - instead of one monolithic explanation first, Tokamak can be introduced as deriving replay-specific placement and wiring from reusable subcircuits.

### 4. How Tokamak's Approach Differs Conceptually

- Add this as an insight slide immediately after the Scroll, Linea, and Aztec comparison.
- Keep the level conceptual. Do not introduce file paths, class names, artifact schemas, or subcircuit lists on this slide.
- Use the same comparison axes from the previous slide:
  - what execution object is already known;
  - what reusable structure exists before the execution;
  - what replay-specific object is derived;
  - what the verifier ultimately checks.
- Suggested contrast:
  - Scroll and Linea emphasize constraining an EVM execution trace: the trace is the witness-like object, and the system checks that the ordered execution is valid.
  - Aztec emphasizes privacy-first execution proofs: private execution is proved locally, then recursively accumulated and rolled up for L1 verification.
  - Tokamak emphasizes circuit composition from a fixed subcircuit library: the replay is used to derive a placement-and-wiring plan over reusable arithmetic components.
- Main insight:
  - Tokamak does not primarily ask, "How do we write one large circuit that describes the whole machine?"
  - It asks, "Given a replay, which reusable subcircuits are needed, how many copies are needed, and how should their wires be connected?"
- Suggested analogy:
  - Other designs can be introduced as checking a complete execution transcript.
  - Tokamak can be introduced as assembling a custom verification worksheet from preprinted problem blocks: the blocks are reusable, but the selected blocks and the connections between answers depend on the replay.
- State the trade-off without overclaiming:
  - Benefit: expensive subcircuit definitions can be reused while the derived circuit focuses on the observed replay shape.
  - Cost: replay-specific placement and wiring must be deterministic and sound; input changes can still alter the derived circuit if the trace shape changes.
- Transition sentence for the next section:
  - We can now name the Tokamak components, but the conceptual meaning of the two compiler stages should come from the paper's field-programmable circuit model.

### 5. Tokamak zk-EVM Components And The Two Compiler Roles

- Show the full Tokamak zk-EVM flow at a conceptual level:
  - `qap-compiler`;
  - `synthesizer`;
  - `prover`;
  - `verifier`.
- Explain the four components using the paper-first model:
  - `qap-compiler`: prepares the reusable circuit basis. Conceptually, it produces the fixed subcircuit library before any particular replay is considered.
  - `synthesizer`: compiles one concrete replay into proof inputs. At the slide level, describe its input as the subcircuit library, Solidity-compiled EVM bytecode, and public/private instance data; describe its output as witness data plus a permutation.
  - `prover`: consumes the fixed library and synthesizer outputs to produce a proof for the replay-derived statement.
  - `verifier`: checks the proof against the public part of the statement.
- Emphasize the two compiler roles:
  - Library compiler: `qap-compiler`
    - runs ahead of a particular replay;
    - answers "what reusable constraint components exist?";
    - output is reusable across many executions until the library version changes;
    - should not be described as compiling a standalone final transaction circuit.
  - Replay compiler: `synthesizer`
    - runs for a concrete replay;
    - answers "what witness and permutation represent this replay over the fixed library?";
    - output is replay-specific;
    - does not redefine the reusable subcircuit library.
- Suggested visual:
  - left lane: `qap-compiler` -> fixed subcircuit library;
  - right lane: bytecode + public/private instance -> `synthesizer` -> witness + permutation;
  - merge lane: library + witness/permutation -> `prover` -> proof -> `verifier`.
- Suggested analogy:
  - `qap-compiler` prints the reusable puzzle pieces.
  - `synthesizer` reads the solved execution and records the values and equality pattern for this particular puzzle.
  - `prover` proves the assembled puzzle is consistent.
  - `verifier` checks the proof without reassembling everything.
- Do not over-detail preprocessing, setup, CLI packaging, Node/Web adapters, or exact JSON schemas on this slide. Mention them later only if needed for implementation anchoring.

### 6. Terminology Introduced By The Two Compiler View

- Add this as a vocabulary bridge immediately after the two-compiler slide.
- Purpose:
  - reduce cognitive load before the field-programmable circuit model;
  - make sure students can distinguish fixed library objects from replay-specific proof inputs;
  - avoid letting implementation names hide the conceptual roles.
- Explain only these terms in Korean in the actual deck, with English terms preserved in parentheses:
  - `subcircuit library`: the reusable circuit basis prepared before a particular replay.
  - `bytecode`: the compiled EVM program being replayed.
  - `public instance`: verifier-visible statement data.
  - `private instance`: prover-side execution data that is not directly revealed.
  - `witness`: concrete values used by the prover to satisfy the selected constraints.
  - `permutation`: the compact representation of equality/copy constraints between connected values.
- Add one compact contrast table with only three rows:
  - before replay: subcircuit library;
  - synthesizer input: bytecode and public/private instance;
  - synthesizer output: witness and permutation.
- Suggested warning:
  - Do not define every term that will appear later. Define only the terms needed to understand the two compiler roles.
- Design constraint:
  - This should be a low-density vocabulary slide. If the table and six definitions do not fit at 14 pt or larger, split it into two slides.

### 7. SNARK Preliminaries For This Talk

- Define statement, witness, public instance, circuit, and proof in introductory terms.
- Explain R1CS/QAP only at the level needed for the audience:
  - arithmetic constraints encode local computation;
  - public wires expose verifier-visible data;
  - private wires carry witness data.
- Explain why preprocessing/setup cares about the circuit description.

### 8. Field-Programmable Circuit Model

- Introduce the paper's model:
  - fixed subcircuit library;
  - bounded number of placements;
  - public I/O wires;
  - interface wires between subcircuits;
  - internal wires inside each subcircuit.
- Show the key abstraction:
  - derived circuit = placement sequence + wire map.
- Explain why this reduces what must vary between executions: the library remains fixed; the replay-specific part is mostly placement and wiring.

### 9. Arithmetic Constraints vs Copy Constraints

- Explain that local correctness and interconnection correctness are different obligations.
- Local arithmetic constraints:
  - each subcircuit instance must satisfy its own relation.
- Copy constraints:
  - if placement A's output feeds placement B's input, both wires must carry the same field element.
- Explain the wire map as a permutation over connecting wires.
- Use a small example with 3 or 4 subcircuits before showing any Tokamak-specific names.

### 10. From Ethereum Replay To Subcircuit Placement

- Define "replay" for the talk:
  - previous state snapshot;
  - transaction;
  - block/environment data;
  - contract code;
  - deterministic execution semantics.
- Explain that the synthesizer follows the replay and records two coupled objects:
  - placements: which reusable subcircuit instance checks each observed operation or helper relation;
  - permutation: which variables across placements must be equal because the replay dataflow says they are the same logical value.
- Explain placement tracking:
  - when an opcode or helper computation consumes values, the synthesizer identifies the current logical values from stack, memory, calldata, storage, block data, or reserved buffers;
  - when the operation produces a value, the synthesizer records a new placement output variable and updates the logical location that now owns that value;
  - the local subcircuit relation checks the operation itself.
- Explain permutation tracking:
  - every logical value is carried through the replay as a producer-consumer relationship;
  - if a later placement input is supposed to reuse an earlier placement output, the synthesizer records an equality relation between the corresponding wires;
  - stack moves, memory copies, calldata copies, return-data copies, storage-key reuse, and public-output exposure are all sources of such equality relations;
  - after synthesis, these equality groups are serialized as a permutation, which is the copy-constraint part of the derived circuit.
- Map common EVM operations to subcircuit categories:
  - buffers for external/public/private inputs and outputs;
  - ALU subcircuits for arithmetic and bitwise operations;
  - hash, signature, Merkle, and accumulator subcircuits for cryptographic/state operations.
- Suggested visual:
  - left side: replay events update symbolic locations such as stack slot, memory slice, storage key, and return buffer;
  - middle: each event creates or consumes placement wires;
  - right side: equal logical values are grouped into permutation cycles;
  - caption: "placements verify local relations; permutation verifies that the replay dataflow connects the same values."
- Keep names illustrative rather than exhaustive.

### 11. Repository-Grounded Implementation View

- Present a compact pipeline:
  - subcircuit library artifacts are generated and packaged;
  - synthesizer consumes high-level bytecode and public/private instance data with the fixed library;
  - synthesis emits witness-oriented data and a permutation;
  - prover and verifier consume those high-level objects.
- Mention the compiled subcircuit list from `compile.sh` only as a reference example.
- Explain metadata roles:
  - metadata connects the abstract subcircuit library to concrete proving-system objects;
  - do not show metadata schemas or generated filenames on the slide.

### 12. Synthesizer Execution Example: Private-State `mintNotes1`

- Add this section after the component and terminology explanation, before returning to general replay-dedicated circuit properties.
- Purpose:
  - make the synthesizer role concrete without turning the talk into a source-code walkthrough;
  - show how one Solidity-level function call becomes verification goals;
  - show how those goals are covered by groups of subcircuits and connected by a permutation.
- Example source:
  - Solidity logic from `PrivateStateController.mintNotes1` and `L2AccountingVault.debitLiquidBalance`;
  - transaction replay fixture from `packages/frontend/synthesizer/examples/privateState/mintNotes/mintNotes1/`;
  - actual synthesizer run performed against that fixture.
- Solidity logic to explain in the deck:
  - `mintNotes1` receives one output note containing an amount and encrypted note data;
  - it validates that the note amount and owner are nonzero;
  - it derives an encrypted-note salt and a note commitment;
  - it debits the caller's private-state liquid balance through the accounting vault;
  - it registers the new note commitment and rejects duplicates;
  - it emits the encrypted note data needed by observers.
- Replay verification goals:
  - bind the transaction, signer/origin, bytecode, public data, and private data to one replay;
  - verify calldata decoding, function dispatch, branches, arithmetic, memory updates, and return/log behavior;
  - verify hash-related computations for note commitment and storage-key style values;
  - verify the external vault call and the balance debit condition;
  - verify storage reads/writes and the resulting state transition;
  - verify that public outputs expose the intended event and state-observation data.
- Subcircuit-composition picture:
  - input/output buffers feed public inputs, block data, EVM bytecode/context, private inputs, and public outputs;
  - signature and origin binding use `Poseidon`, `DecToBit`, `JubjubExpBatch`, and `EdDsaVerify`;
  - EVM arithmetic, comparisons, bitwise operations, stack/memory checks, and control-flow-adjacent values use `ALU1`, `ALU2`, and `Accumulator`;
  - hash-related replay obligations use `Poseidon` placements in this run;
  - storage and state membership/update obligations use `VerifyMerkleProof`;
  - the permutation connects equal values across these groups so that a value produced in one placement is the same value consumed later.
- Suggested visual:
  - left: "`mintNotes1` transaction replay";
  - middle, four horizontal lanes:
    - transaction and signer binding;
    - Solidity/EVM local execution;
    - hash, commitment, and storage-key computation;
    - state transition and public outputs;
  - right: "witness + permutation";
  - bottom annotation: "local constraints check each box; permutation checks equality between boxes."
- Speaker-note facts from the actual synthesizer run:
  - the fixture replay completed with 165 placement instances;
  - the subcircuit count was `ALU1: 88`, `VerifyMerkleProof: 36`, `ALU2: 15`, `Poseidon: 12`, `JubjubExpBatch: 4`, `DecToBit: 2`, `Accumulator: 2`, `EdDsaVerify: 1`, and five buffer placements;
  - the permutation had 3710 entries and passed the permutation check;
  - the EVM step log contained 628 rows, including `KECCAK256`, `SLOAD`, `SSTORE`, `CALL`, and `LOG1` events relevant to the function narrative.
- Keep these details out of the main slide unless there is enough room at 14 pt or larger:
  - raw placement JSON;
  - exact transaction calldata;
  - full opcode histogram;
  - implementation class or handler names.
- Caution for wording:
  - do not claim that Solidity `keccak256` is literally checked by a Keccak subcircuit in this run; describe the placement-level fact as hash-related obligations represented by `Poseidon` placements;
  - do not claim that every call to the same bytecode yields the same placement list.

### 13. What Makes The Output Circuit Replay-Dedicated

- The replay fixes:
  - which operations occurred;
  - how many times they occurred;
  - which subcircuit type represents each operation;
  - the dataflow edges between operation outputs and later inputs;
  - public instance values and descriptions.
- Values can affect witnesses without changing the circuit only when they do not change placement or wiring.
- Values change the circuit when they alter the execution trace shape.

### 14. Which Contracts Can Reuse One Replay-Dedicated Circuit?

- Replace the earlier "same program, same circuit" framing with an admissibility question:
  - given one trusted synthesizer output for a contract entry, can that same derived circuit be reused for every successful transaction in the supported class?
- Explain why this matters:
  - the on-chain verifier can check a proof for a fixed public statement and proving key, but it cannot independently validate an arbitrary newly generated synthesizer output as part of normal contract verification;
  - therefore one trusted/preprocessed output must be reusable for the intended set of transactions;
  - if each transaction required a different placement topology, the system would need a different derived circuit and the reusable on-chain verification story would break.
- State the admissibility condition:
  - for every successful replay of the supported contract-entry transaction class, the placement topology must be identical;
  - the public/private interface layout, buffer bounds, library version, constants, setup parameters, and metadata must also remain compatible;
  - witness values may change, but they must not change the topology or interface shape.
- State the scope explicitly:
  - failed transaction paths are not considered in this admissibility criterion;
  - Tokamak zk-EVM should not be presented as applicable to all Ethereum smart contracts;
  - it applies to contracts or contract-entry transaction classes whose successful paths are circuit-topology invariant.
- Give the nuance:
  - input-dependent loops or conditionals are not automatically impossible;
  - they can still be admissible if all successful transactions have a deterministic, topology-identical execution path after contract-level validation;
  - for example, a conditional that rejects unsupported inputs and allows only one successful path can remain compatible with one reusable circuit.
- Add simple examples directly in this section, not as a separate strategy section.
- Likely admissible examples:
  - fixed-arity minting such as one-note minting: the value changes, encrypted note data changes, and storage keys change, but the successful replay still follows the same operation shape;
  - fixed-shape token transfer: sender, receiver, and amount change, but the same balance checks, two balance updates, and event emission occur on every successful path;
  - bounded single-slot update: a mapping key and value change, but each successful transaction performs the same key computation, one read, one write, and one event;
  - validation-then-single-path contract: many invalid inputs revert, but every successful input passes validation and enters one common execution path.
- Likely inadmissible examples:
  - batch transfer where the number of recipients controls the loop count;
  - array-processing contracts where successful calls process a variable-length list;
  - a function whose successful branches execute different external calls or different numbers of storage writes;
  - router-like contracts where input selects a different target contract or call depth;
  - contracts whose successful path emits a variable number of logs or returns variable-shaped data.
- Borderline examples to explain carefully:
  - an input-dependent conditional is admissible if both successful branches perform the same placement topology, or if only one branch can succeed and the other reverts;
  - a loop over user data is admissible only if the successful executed iteration count is fixed or the contract uses a fixed executed shape with dummy/no-op positions;
  - dynamic storage keys are admissible when the number and order of storage operations remain fixed; they are inadmissible when the access pattern length or order changes across successful transactions.
- Suggested slide design:
  - use a two-column table: "Reusable circuit likely works" vs "Reusable circuit likely fails";
  - use short examples, not code;
  - add one bottom-line sentence: "Values may vary; successful topology must not."

### 15. Soundness Intuition And Failure Modes

- Explain what can go wrong if the replay-to-circuit derivation is not deterministic:
  - two parties may disagree on the circuit for the same claimed execution;
  - verifier preprocessing may no longer bind the intended statement;
  - hidden fallback logic could mask an unsupported trace.
- Explain why fallback logic must not hide synthesis defects:
  - unsupported shape should be rejected clearly;
  - fallback should only improve usability when the semantic statement remains unchanged.

### 16. Suggested Visuals

- Diagram 1: "fixed library" on the left, "replay trace" on the top, "derived placement + wiring" in the center, "SNARK proof" on the right.
- Diagram 2: subcircuit placement table with columns: placement index, subcircuit type, inputs, outputs, source edges.
- Diagram 3: copy constraint/permutation cycles over a small set of connecting wires.
- Diagram 4: admissible vs inadmissible successful paths:
  - admissible: different witness values, same successful placement topology;
  - inadmissible: different successful branches, loop counts, calls, or storage access shapes produce different placement topology.
- Diagram 5: replay dataflow tracker: stack/memory/storage locations point to placement wires, and repeated logical values become permutation cycles.
- Diagram 6: `mintNotes1` replay lanes showing verification goals mapped to subcircuit groups.
- Diagram 7: admissible contract examples matrix: fixed-arity mint, fixed-shape transfer, bounded single-slot update, variable batch, router, variable logs.

### 17. Planned Slide Outline

1. Title and guiding question.
2. Why EVM execution proofs matter: scalability and privacy.
3. One evidence slide: scaling still leads in size, privacy is re-emerging.
4. From application goals to arithmetic statements.
5. Why NP verification circuits can depend on the found EVM trace.
6. How selected Ethereum ZK projects turn execution into proof inputs.
7. How Tokamak's subcircuit-library approach differs.
8. Tokamak zk-EVM components: qap-compiler, synthesizer, prover, verifier.
9. The two compiler roles: library compiler vs replay compiler.
10. Terminology from the two-compiler view.
11. Minimal SNARK and circuit vocabulary.
12. Field-programmable circuit idea.
13. Subcircuit library, placement, and wire map.
14. Arithmetic constraints vs copy constraints.
15. Ethereum replay as a source of placements and permutation.
16. Tokamak zk-EVM synthesis pipeline.
17. High-level generated objects and their meanings.
18. Synthesizer execution example: private-state `mintNotes1`.
19. `mintNotes1` verification goals and subcircuit-composition picture.
20. Why a trusted replay-dedicated circuit must be reusable for the supported transaction class.
21. Contract admissibility examples: all successful paths must preserve the same placement topology.
22. Summary and discussion questions.
23. Backup slide for Q&A only: how the synthesizer follows complex EVM call structures.
24. Backup table for Q&A only: EVM opcode-to-subcircuit or composition mapping.

## Appendix / Q&A Backup Material

### A1. How The Synthesizer Handles Complex EVM Call Structures

- Use this material only if the audience asks about nested calls, `CALL`, `DELEGATECALL`, return data, or whether Tokamak creates a separate circuit for each called contract.
- Core answer:
  - the synthesizer does not search for a call tree and does not compile a separate top-level circuit for each call;
  - the EVM interpreter has already produced the concrete message-call replay;
  - the synthesizer follows that replay depth by depth and turns each observed step into placements over the same fixed subcircuit library.
- Conceptual model:
  - each EVM call frame is treated as a separate execution context;
  - each context has its own tracked stack, memory, caller value, callee value, calldata, return data, and result data;
  - child contexts are created from the parent call instruction and the parent memory slice;
  - child return or revert data is copied back into the parent context and checked against the interpreter's observed memory.
- Suggested Q&A explanation in Korean:
  - "CALL 구조는 Synthesizer가 새로 추측하는 대상이 아니라 replay에 이미 나타난 구조다. Synthesizer는 call depth마다 context를 만들고, parent memory에서 child calldata가 정확히 복사되었는지, child result가 parent return buffer로 정확히 돌아왔는지를 검증한다. 각 context 내부의 연산은 기존 ALU, memory, storage, hash, Merkle 계열 placement로 처리되고, context 경계에서 같은 값이어야 하는 부분은 permutation으로 연결된다."
- Q&A diagram:
  - show a small call stack, not source code:

```text
depth 0: Contract A
  CALL: calldata copied from A.memory[inOffset..inOffset+len]
      |
      v
depth 1: Contract B
  local EVM steps -> placements
  RETURN/REVERT: result memory recorded
      |
      v
depth 0: Contract A
  return data copied into A.memory[outOffset..outOffset+len]
```

- What is verified at call boundaries:
  - call target and calldata come from the parent stack and memory;
  - child `CALLER` semantics are derived from the call type;
  - `DELEGATECALL` keeps the inherited caller while executing different code context;
  - returned bytes are the bytes that the child actually produced;
  - parent memory after the call matches the interpreter-observed memory;
  - storage obligations still attach to the effective execution/storage context observed in the replay.
- Relation to circuit stability:
  - if different inputs change call count, call depth, call target, call type, calldata length, or return-data shape, the placement topology can change;
  - therefore complex dynamic calls are an important reason why "same bytecode" is not enough to guarantee "same derived circuit."
- Current support boundaries to mention only if asked:
  - message-call flows such as `CALL`, `CALLCODE`, `DELEGATECALL`, and `STATICCALL` are part of the documented runtime model;
  - `CREATE`, precompiles, and other unsupported paths should be described as rejected or out of scope rather than silently handled.
- Do not over-detail:
  - do not show handler names, exact TypeScript control flow, or raw memory arrays on a slide;
  - do not imply that call handling removes replay dependence;
  - do not claim support for arbitrary Ethereum L1 behavior.

### A2. EVM Opcode-To-Subcircuit Mapping Backup Table

- Use this as reference material only. It is too dense for the main seminar body.
- Source basis:
  - opcode catalog: `evm.codes` and `duneanalytics/evm.codes` `opcodes.json`, accessed 2026-06-14;
  - Tokamak mapping: `configuredTypes.ts`, `instructions.ts`, `InstructionHandler`, and `MemoryManager`.
- Table design:
  - split the appendix across multiple slides if rendered at 14 pt or larger;
  - keep one row per opcode family when the same rule applies to all members of a range;
  - include exact opcode names in each row so the table can still answer "what about this opcode?";
  - include a `Status` column: `direct placement`, `composition`, `bookkeeping`, `unsupported`, or `caution`.
- Reading rule:
  - not every EVM opcode creates a new arithmetic placement;
  - many opcodes update stack, memory, or call context and are later tied to other placements through the witness and permutation;
  - unsupported opcodes should be presented as rejected paths, not as silently handled fallbacks.

| EVM opcode(s) | Status | Tokamak subcircuit or composition | Notes for Q&A |
| --- | --- | --- | --- |
| `STOP` | bookkeeping | no arithmetic subcircuit; final stack/output consistency | Ends execution frame. |
| `ADD`, `MUL`, `SUB` | direct placement | `ALU1` | Selector inside `ALU1` chooses the arithmetic operation. |
| `DIV`, `SDIV`, `MOD`, `SMOD`, `ADDMOD`, `MULMOD` | direct placement | `ALU2` | Division/modular arithmetic family. |
| `EXP` | composition | `DecToBit` + repeated `SubExpBatch` placements | Exponent is decomposed into bits, then batched exponentiation constraints are placed. |
| `SIGNEXTEND` | direct placement | `ALU2` | Sign-extension arithmetic relation. |
| `LT`, `GT`, `SLT`, `SGT`, `EQ`, `ISZERO` | direct placement | `ALU1` | Comparison and zero-test family. |
| `AND`, `OR`, `XOR`, `NOT` | direct placement | `ALU1` | Bitwise family; also reused by memory masking helpers. |
| `BYTE`, `SHL`, `SHR`, `SAR` | direct placement | `ALU2` | Byte extraction and shifts; memory helpers may place `SHL`/`SHR`. |
| `KECCAK256` | caution | memory chunking + `Poseidon` placements | In this synthesizer, hash-shaped replay obligations are represented with Poseidon, not a dedicated Keccak subcircuit. |
| `ADDRESS` | composition | call-context value + permutation/buffer wiring | Loads the current context's callee address. |
| `BALANCE` | composition | static EVM input value + stack consistency | Target address comes from stack; result is treated as observed static input. |
| `ORIGIN` | composition | cached origin derived from transaction binding: `Poseidon`, `DecToBit`, `JubjubExpBatch`, `EdDsaVerify`, then address masking | The expensive signature/origin path is prepared before normal opcode handling. |
| `CALLER` | composition | call-context caller value + permutation/buffer wiring | Caller semantics depend on call depth and call type. |
| `CALLVALUE` | composition | static EVM input value + stack consistency | Observed from replay context. |
| `CALLDATALOAD` | composition | calldata memory reconstruction; optional `SHL`, `SHR`, `AND`, `Accumulator` | Exact helper placements depend on memory aliasing and byte alignment. |
| `CALLDATASIZE` | composition | static context value + stack consistency | No dedicated arithmetic subcircuit in the ordinary case. |
| `CALLDATACOPY` | composition | memory copy reconstruction; optional `SHL`, `SHR`, `AND`, `Accumulator` | Checks synthesized memory against interpreter-observed memory. |
| `CODESIZE` | composition | static code-context value + stack consistency | Bound to the observed code context. |
| `CODECOPY` | composition | code bytes as observed/static data + memory reconstruction helpers | Checks the copied memory slice. |
| `GASPRICE` | composition | static EVM input value + stack consistency | Gas value is observed, but gas accounting is not the main constraint story. |
| `EXTCODESIZE`, `EXTCODEHASH` | composition | static EVM input value keyed by target address + stack consistency | Target address comes from stack. |
| `EXTCODECOPY` | composition | external code bytes as observed/static data + memory reconstruction helpers | Checks copied memory against replay. |
| `RETURNDATASIZE` | composition | static return-data context value + stack consistency | Bound to the current message-call context. |
| `RETURNDATACOPY` | composition | return-data memory copy + optional memory helper placements | Verifies the copied bytes match child-call return data. |
| `BLOCKHASH` | composition | block buffer value or zero for out-of-range requests | Bounded by configured previous-block-hash support. |
| `COINBASE`, `TIMESTAMP`, `NUMBER`, `PREVRANDAO`, `GASLIMIT`, `CHAINID`, `SELFBALANCE`, `BASEFEE` | composition | block/EVM input buffers + stack consistency | Environment values are loaded from prepared inputs. |
| `BLOBHASH`, `BLOBBASEFEE` | unsupported | rejected / not synthesized | Keep out of supported examples. |
| `POP` | bookkeeping | stack consistency only | No new arithmetic relation. |
| `MLOAD` | composition | memory reconstruction; optional `SHL`, `SHR`, `AND`, `Accumulator` | Helper placements depend on overlapping writes and byte alignment. |
| `MSTORE` | composition | memory write tracking; optional memory helper placements | Stores tracked `DataPt` values into memory model. |
| `MSTORE8` | composition | memory write tracking + possible `AND` masking | Stores the low byte; masking may create an `ALU1` `AND` placement. |
| `SLOAD` | composition | storage read + `VerifyMerkleProof` for registered keys; private input path for unregistered keys | State/storage proof obligations are separate from local stack behavior. |
| `SSTORE` | composition | storage write cache + later `VerifyMerkleProof` and root update obligations | Finalization emits the state-transition proof obligations. |
| `JUMP`, `JUMPI`, `JUMPDEST` | bookkeeping | observed control-flow consistency over replay; no dedicated branch-search circuit | The replay fixes the executed path; branch changes can alter placement topology. |
| `PC`, `MSIZE`, `GAS` | composition | static observed value + stack consistency | Values are loaded as replay-observed data. |
| `TLOAD`, `TSTORE` | unsupported | rejected / not synthesized | Transient storage is out of current support. |
| `MCOPY` | composition | memory-to-memory reconstruction; optional `SHL`, `SHR`, `AND`, `Accumulator` | Checks synthesized memory against interpreter-observed memory. |
| `PUSH0`, `PUSH1`-`PUSH32` | bookkeeping | immediate/static value loaded into stack | No arithmetic placement unless later consumed by another placement. |
| `DUP1`-`DUP16` | bookkeeping | stack aliasing plus later permutation consistency | Duplicated value must remain equal to the original logical value. |
| `SWAP1`-`SWAP16` | bookkeeping | stack reordering plus later permutation consistency | Reorders tracked data pointers. |
| `LOG0`-`LOG4` | composition | public-output buffer entries for topics/data + memory reconstruction helpers | Topic and log-data chunks become public-output-oriented data. |
| `CREATE`, `CREATE2` | unsupported | rejected / not synthesized | Contract creation is out of current support. |
| `CALL`, `CALLCODE`, `DELEGATECALL`, `STATICCALL` | composition | call-context setup, calldata memory copy, return-data memory copy, optional memory helper placements, static call-result value | No separate "call subcircuit"; the replay creates child contexts and ordinary placements inside them. |
| `RETURN`, `REVERT` | composition | result-memory capture + parent return-data transfer checks | Used to close or abort a message-call frame while preserving replay-observed bytes. |
| `INVALID` | unsupported | rejected / not synthesized | Do not describe as a supported proof path. |
| `SELFDESTRUCT` | unsupported | rejected / not synthesized | Out of current support. |
| Undefined opcode bytes not listed by `evm.codes` | unsupported | rejected / not synthesized | The backup table should not imply coverage of undefined byte values. |

- Speaker warning:
  - this table is a support matrix and intuition guide, not a formal opcode specification;
  - where the row says `composition`, the exact placement count is replay-dependent;
  - memory aliasing, calldata length, return-data length, storage access pattern, and call depth can all change how many helper placements are needed.

## Verification Checklist For The Future Deck

- The first half can be understood without reading the repository.
- The single opening evidence slide has source labels, access date, and metric definitions.
- TVS, TVL, 30D volume, funding, acquisition values, and valuation are not mixed as if they were the same metric.
- The introduction does not claim a completed shift from scalability to privacy; it claims that scalability still leads in size while privacy is re-emerging as an important Ethereum ZKP priority.
- The comparative Ethereum ZK section cites official project documentation or repositories for technical claims.
- The comparative Ethereum ZK section uses only Scroll, Linea, and Aztec.
- The comparative Ethereum ZK section stays high-level and does not introduce Tokamak implementation artifacts before the field-programmable circuit model.
- The comparative Ethereum ZK section does not claim all projects solve the replay-to-circuit problem identically; it distinguishes EVM trace-as-witness designs from Aztec's non-EVM privacy-first execution-proof design.
- The Tokamak contrast slide explains the subcircuit-library approach through comparison axes, not implementation internals.
- The Tokamak contrast slide gives the audience one memorable analogy, but it must remain technically faithful: reusable blocks are fixed, replay-specific placement and wiring still matter.
- Conceptual explanations of Tokamak's two compiler roles are grounded in the paper's field-programmable circuit model, while repository documents are used only for package names and workflow boundaries.
- The deck distinguishes `qap-compiler` as the reusable-library compiler from `synthesizer` as the replay-to-witness-and-permutation compiler.
- The deck shows `prover` and `verifier` as backend consumers of the fixed library and replay-specific synthesizer outputs.
- Terms introduced by the two-compiler slide are explained before the talk proceeds to the full field-programmable circuit model.
- The terminology slide defines only the minimal terms needed for the two-compiler explanation.
- The Ethereum replay section explains both outputs of synthesis: operation-to-placement tracking and dataflow-to-permutation tracking.
- The permutation explanation makes clear that stack moves, memory copies, calldata, return data, storage reuse, and public-output exposure can create equality relations between placement wires.
- The deck does not describe the synthesizer as merely listing subcircuits; it also tracks how variables are connected across subcircuit placements.
- The `mintNotes1` example is grounded in the Solidity source and an actual synthesizer run, but the slide does not expose raw placement JSON or a full opcode histogram.
- The `mintNotes1` example explains verification goals before naming subcircuit groups.
- The `mintNotes1` subcircuit visual groups placements by role instead of showing all 165 placement instances.
- The `mintNotes1` wording treats Poseidon as the hash-related subcircuit used by this run and does not claim that the run uses a dedicated Keccak subcircuit.
- Complex EVM call-structure material is kept as Q&A backup and does not interrupt the main explanation.
- The Q&A call-structure explanation describes per-depth context tracking and boundary checks without exposing implementation internals.
- The Q&A call-structure explanation connects dynamic calls back to circuit-stability risks.
- The opcode-to-subcircuit backup table uses `evm.codes` as the opcode catalog and the Tokamak repository as the synthesis-mapping source.
- The opcode-to-subcircuit backup table distinguishes direct arithmetic placements from composed memory/context/storage handling.
- The opcode-to-subcircuit backup table marks unsupported opcodes explicitly and does not present fallbacks as support.
- Every implementation detail is tied back to the conceptual model.
- The deck distinguishes replay-dedicated circuits, reusable circuits for an admissible contract-entry transaction class, and universal-machine circuits.
- The deck states that one trusted synthesizer output must be reusable for all successful transactions in the supported class because arbitrary newly generated synthesizer outputs are not independently validated on-chain.
- The deck states the exact admissibility condition: all successful replays in the supported class must preserve identical placement topology and compatible interface layout.
- The deck explicitly excludes failed transaction paths from the admissibility discussion.
- The deck states that Tokamak zk-EVM should not be presented as applicable to all Ethereum smart contracts.
- The contract admissibility slide uses concrete examples instead of a separate abstract design-strategy slide.
- The examples include both likely admissible and likely inadmissible successful-path shapes.
- The deck states that input-dependent loops or conditionals are admissible only when successful executions still have deterministic, topology-identical replay shape.
- The deck states that different successful input-induced control flow can require a different derived circuit and therefore fall outside the reusable-circuit model.
- The deck does not overclaim support for arbitrary Ethereum L1 behavior.
- Code references are used as anchors, not as the main teaching structure.
- All slide text, diagrams, speaker notes, and audience-facing examples are written in Korean, with English technical terms preserved where needed for precision.
- No audience-facing slide text is smaller than 14 pt, including labels, captions, table cells, footnotes, and source labels.

## Open Questions Before Creating The Actual Slides

- Desired seminar length: 30, 45, 60, or 90 minutes.
- Desired output format: Markdown outline, PowerPoint deck, Google Slides, or another format.
- How much of the `mintNotes1` example should be kept in main slides versus speaker notes if the final time budget is short.
- Whether to include mathematical notation from the paper directly, or keep notation mostly informal.
