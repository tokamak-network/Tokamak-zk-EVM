# Seminar Deck Creation Plan: Tokamak zk-EVM Replay-Dedicated Circuit Derivation

## Audience

The audience is graduate students who are studying zero-knowledge proofs and SNARKs at an introductory level. They should be assumed to know basic ideas such as arithmetic circuits, witnesses, public inputs, and the prover-verifier split, but not the Tokamak zk-EVM implementation or the field-programmable SNARK construction.

## Goal

Create seminar presentation material explaining how Tokamak zk-EVM derives a replay-dedicated circuit from a subcircuit library when an Ethereum program execution replay is given.

The presentation must also explain the conditions and design effort needed to make the derived output circuit stable for the same program when the program input changes. This point should be treated carefully: the same bytecode does not automatically imply the same replay-specific circuit if different inputs change control flow, memory/storage access shape, or other trace-level structure.

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
- The repository should be used as an implementation reference for terminology, artifact names, and the actual synthesis flow.
- The deck should avoid source-code walkthroughs except where a short implementation anchor clarifies an abstract concept.
- No claim should imply that every input to the same EVM bytecode yields the same derived circuit. The deck must state the required invariance assumptions explicitly.

## Primary Sources

### Academic Source

- `~/downloads/2024-507.pdf`
- Paper title: "An Efficient SNARK for Field-Programmable and RAM Circuits"
- Authors: Jehyuk Jang and Jamie Judd
- Main concepts to use:
  - SNARKs for verifiable computation of changing targets.
  - The problem of circuit-specific preprocessing for RAM-like computation.
  - Field-programmable circuit derivation from a fixed subcircuit library.
  - A derived circuit as subcircuit placement plus a wire map.
  - Separation between arithmetic constraints inside subcircuits and copy constraints between subcircuits.
  - The wire map as a permutation over connecting wires.

### Repository Sources

- `packages/frontend/qap-compiler/scripts/compile.sh`
  - Lists the compiled subcircuits and confirms that the compiled circuits are composable library components, not one standalone top-level proof circuit.
- `packages/frontend/qap-compiler/README.md`
  - Describes the published Tokamak zk-EVM Subcircuit Library artifact surface.
- `packages/frontend/qap-compiler/docs/subcircuit-library-generation-and-release.md`
  - Describes maintainer-side generation and published library artifacts.
- `packages/frontend/synthesizer/docs/architecture.md`
  - Describes the shared synthesis layers and generated artifacts.
- `packages/frontend/synthesizer/docs/execution-flow.md`
  - Describes input preparation, synthesis execution, artifact generation, and adapter output.
- `packages/frontend/synthesizer/core/src/app/synthesize.ts`
  - Shows the end-to-end runtime: reconstruct state, create transaction, run `synthesizeTX()`, capture final state, and generate circuit artifacts.
- `packages/frontend/synthesizer/core/src/circuitGenerator/circuitGenerator.ts`
  - Shows that final artifacts are placement variables, public instance data, public instance descriptions, and a permutation.
- `packages/frontend/synthesizer/core/src/circuitGenerator/handlers/variableGenerator.ts`
  - Shows placement-to-subcircuit witness generation, output checks, public instance extraction, buffer-size checks, and EVM-wire-to-Circom-wire conversion.
- `packages/frontend/synthesizer/core/src/circuitGenerator/handlers/permutationGenerator.ts`
  - Shows construction and validation of permutation groups for copy constraints.
- `packages/frontend/synthesizer/core/src/subcircuit/configuredTypes.ts`
  - Shows the configured subcircuit names, buffers, and opcode-to-subcircuit mapping.
- `packages/frontend/synthesizer/core/src/subcircuit/libraryTypes.ts`
  - Shows the metadata model: setup parameters, global wire list, frontend configuration, and subcircuit information.

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

### 3. SNARK Preliminaries For This Talk

- Define statement, witness, public instance, circuit, and proof in introductory terms.
- Explain R1CS/QAP only at the level needed for the audience:
  - arithmetic constraints encode local computation;
  - public wires expose verifier-visible data;
  - private wires carry witness data.
- Explain why preprocessing/setup cares about the circuit description.

### 4. Field-Programmable Circuit Model

- Introduce the paper's model:
  - fixed subcircuit library;
  - bounded number of placements;
  - public I/O wires;
  - interface wires between subcircuits;
  - internal wires inside each subcircuit.
- Show the key abstraction:
  - derived circuit = placement sequence + wire map.
- Explain why this reduces what must vary between executions: the library remains fixed; the replay-specific part is mostly placement and wiring.

### 5. Arithmetic Constraints vs Copy Constraints

- Explain that local correctness and interconnection correctness are different obligations.
- Local arithmetic constraints:
  - each subcircuit instance must satisfy its own relation.
- Copy constraints:
  - if placement A's output feeds placement B's input, both wires must carry the same field element.
- Explain the wire map as a permutation over connecting wires.
- Use a small example with 3 or 4 subcircuits before showing any Tokamak-specific names.

### 6. From Ethereum Replay To Subcircuit Placement

- Define "replay" for the talk:
  - previous state snapshot;
  - transaction;
  - block/environment data;
  - contract code;
  - deterministic execution semantics.
- Explain that the synthesizer follows the replay and records computation events as placements.
- Map common EVM operations to subcircuit categories:
  - buffers for external/public/private inputs and outputs;
  - ALU subcircuits for arithmetic and bitwise operations;
  - hash, signature, Merkle, and accumulator subcircuits for cryptographic/state operations.
- Keep names illustrative rather than exhaustive.

### 7. Repository-Grounded Implementation View

- Present a compact pipeline:
  - subcircuit library artifacts are generated and packaged;
  - adapter loads input snapshots and library metadata/WASM;
  - shared synthesis reconstructs Tokamak L2 execution state and runs synthesis;
  - circuit generation emits placement variables, public instance data, public instance descriptions, and a permutation.
- Mention the compiled subcircuit list from `compile.sh` only as a reference example.
- Explain metadata roles:
  - setup parameters define bounds and public/private wire partitions;
  - subcircuit info gives input/output wire ranges and flatten maps;
  - global wire list maps local subcircuit wires into the global circuit view.

### 8. What Makes The Output Circuit Replay-Dedicated

- The replay fixes:
  - which operations occurred;
  - how many times they occurred;
  - which subcircuit type represents each operation;
  - the dataflow edges between operation outputs and later inputs;
  - public instance values and descriptions.
- Values can affect witnesses without changing the circuit only when they do not change placement or wiring.
- Values change the circuit when they alter the execution trace shape.

### 9. Stability Across Different Inputs To The Same Program

- State the main condition:
  - identical output circuit requires identical placement topology and identical public/private interface layout, even if private witness values differ.
- Explain stable variation:
  - data values change inside the same operation sequence;
  - the same wires connect the same logical producers and consumers;
  - buffer sizes and public instance layout remain within fixed bounds;
  - the same library version, constants, setup parameters, and metadata are used.
- Explain unstable variation:
  - branch direction changes;
  - loop iteration count changes;
  - dynamic calls or created execution contexts change;
  - memory/storage access shape changes in a way that changes recorded placements;
  - cryptographic/state helper counts change;
  - public/private classification or output length changes.
- Give the key warning:
  - "same program" is not enough; a stable circuit family needs trace-shape invariance or a deliberate universalization/padding strategy.

### 10. Design Effort For Stable Program-Dedicated Circuits

- Discuss possible engineering strategies:
  - restrict the supported program/input domain so branch and loop structure is fixed;
  - pad repeated operations to fixed bounds;
  - include both branches with selectors when the cost is acceptable;
  - canonicalize ordering of accesses and placements;
  - keep buffer interfaces fixed and reject over-bound executions;
  - version-lock the subcircuit library, constants, and metadata;
  - separate data-dependent witness values from topology-dependent synthesis decisions.
- Discuss the trade-off:
  - more stability usually means larger circuits or stricter input admissibility.

### 11. Soundness Intuition And Failure Modes

- Explain what can go wrong if the replay-to-circuit derivation is not deterministic:
  - two parties may disagree on the circuit for the same claimed execution;
  - verifier preprocessing may no longer bind the intended statement;
  - hidden fallback logic could mask an unsupported trace.
- Explain why fallback logic must not hide synthesis defects:
  - unsupported shape should be rejected clearly;
  - fallback should only improve usability when the semantic statement remains unchanged.

### 12. Suggested Visuals

- Diagram 1: "fixed library" on the left, "replay trace" on the top, "derived placement + wiring" in the center, "SNARK proof" on the right.
- Diagram 2: subcircuit placement table with columns: placement index, subcircuit type, inputs, outputs, source edges.
- Diagram 3: copy constraint/permutation cycles over a small set of connecting wires.
- Diagram 4: stable vs unstable inputs:
  - stable: same trace shape, different witness values;
  - unstable: branch change, different placement sequence.
- Diagram 5: trade-off curve between circuit stability and circuit size.

### 13. Planned Slide Outline

1. Title and guiding question.
2. Why EVM execution proofs matter: scalability and privacy.
3. One evidence slide: scaling still leads in size, privacy is re-emerging.
4. From application goals to arithmetic statements.
5. Why NP verification circuits can depend on the found EVM trace.
6. Minimal SNARK and circuit vocabulary.
7. Field-programmable circuit idea.
8. Subcircuit library, placement, and wire map.
9. Arithmetic constraints vs copy constraints.
10. Ethereum replay as a source of placements.
11. Tokamak zk-EVM synthesis pipeline.
12. Generated artifacts and their meanings.
13. Example replay-to-placement walkthrough.
14. Why a replay-dedicated circuit is not automatically program-dedicated.
15. Conditions for stable output under changed inputs.
16. Engineering strategies, trade-offs, and limitations.
17. Summary and discussion questions.

## Verification Checklist For The Future Deck

- The first half can be understood without reading the repository.
- The single opening evidence slide has source labels, access date, and metric definitions.
- TVS, TVL, 30D volume, funding, acquisition values, and valuation are not mixed as if they were the same metric.
- The introduction does not claim a completed shift from scalability to privacy; it claims that scalability still leads in size while privacy is re-emerging as an important Ethereum ZKP priority.
- Every implementation detail is tied back to the conceptual model.
- The deck distinguishes replay-dedicated, program-dedicated, and universal-machine circuits.
- The deck states the exact invariance conditions required for equal output circuits across input changes.
- The deck states that different input-induced control flow can require a different derived circuit.
- The deck does not overclaim support for arbitrary Ethereum L1 behavior.
- Code references are used as anchors, not as the main teaching structure.
- All slide text, diagrams, speaker notes, and audience-facing examples are written in Korean, with English technical terms preserved where needed for precision.
- No audience-facing slide text is smaller than 14 pt, including labels, captions, table cells, footnotes, and source labels.

## Open Questions Before Creating The Actual Slides

- Desired seminar length: 30, 45, 60, or 90 minutes.
- Desired output format: Markdown outline, PowerPoint deck, Google Slides, or another format.
- Whether to include a small concrete transaction example from the repository fixtures.
- Whether to include mathematical notation from the paper directly, or keep notation mostly informal.
