# Seminar Deck Creation Plan: Tokamak zk-EVM Replay-Dedicated Circuit Derivation

## Major Revision Plan For Slides 6-29

### Reason For Revision

Slides 6 onward currently introduce many Tokamak and SNARK concepts too quickly. The sequence names several ideas but often does not make the audience-facing question, the intuition, and the visual evidence line up on the same slide. The target audience is introductory SNARK graduate students who do not know Tokamak zk-EVM, so the deck must reduce implementation jargon, introduce one new idea at a time, and keep each slide anchored to a concrete question.

The revision should not be a local wording pass. It should be a communication rewrite of the main technical body.

### Concrete Diagnosis Of The Current Slides

This diagnosis is based on the current HTML deck, not on the intended outline. The main problem is not that individual phrases are awkward; the technical body often skips the conceptual bridge that would let an introductory SNARK audience understand why the next object is being introduced.

#### Slide 6: "회로는 답을 찾는 장치가 아니다"

- The slide states the NP-verification idea, but it does not show a concrete candidate execution being checked.
- The right panel lists `branch choice`, `loop count`, `memory/storage access`, `call structure`, and `intermediate dataflow`, but it does not explain how each item changes the needed verification circuit.
- The slide's conclusion says circuit shape can change, but the body does not demonstrate a shape change.
- The English noun list feels like notes for the presenter, not audience-facing explanation.
- This slide should be the conceptual bridge from "verification not search" to "function-specific verification circuits"; currently it only asserts that bridge.

#### Slide 7: "다른 Ethereum ZK 시스템은 실행을 어떻게 proof input으로 보는가"

- The table appears before the audience has a stable model of "execution record as proof input."
- Scroll, Linea, and Aztec are not directly comparable in the way the table presents them; two are EVM-trace-oriented systems, while Aztec is privacy-first and not simply an EVM execution-record system.
- The table uses `proof input`, `opcode trace`, `execution traces`, `constraints`, `kernel circuits`, and `rollup circuits` without enough explanation.
- There is no explicit takeaway such as "many systems start from an execution record, but they differ in how fixed or specialized the verification circuit is."
- The slide is source-oriented rather than audience-oriented: it catalogs projects but does not clearly prepare the Tokamak contrast.

#### Slide 8: "Tokamak은 reusable block을 조립하는 쪽에 초점을 둔다"

- The slide introduces the key Tokamak contrast, but the analogy is too compressed.
- `preprinted blocks`, `solved transcript`, and `custom worksheet` are not self-explanatory and do not align cleanly with the deck's chosen Korean terminology.
- The question "which reusable block and how many" is good, but the visual does not show how a block is chosen from an execution record.
- The slide still relies on `reusable block` before giving a visual example of one block.
- The contrast with the previous slide is weak because the previous slide never clearly established the "machine-like fixed circuit" baseline.

#### Slide 9: "이 발표에서 필요한 최소 용어"

- The vocabulary slide comes after several terms have already been used: proof input, circuit, witness, reusable block, trusted circuit.
- The slide defines generic SNARK terms, but it does not explain which of them are needed for the immediate next step.
- `statement` is retained as a term, but the deck otherwise tries to use `검증 회로`; this can reintroduce the terminology confusion that recent edits tried to remove.
- The terms are presented as six independent cards, not as a prover-verifier flow.
- For the target audience, this slide should be either much earlier or replaced by definitions only when each term becomes necessary.

#### Slide 10: "Tokamak 회로 유도 직관"

- This slide is meant to introduce intuition, but it is mostly a bilingual glossary.
- It repeats ideas that are separately reintroduced on slide 14, which creates redundancy rather than clarity.
- `trusted circuit` appears before the audience knows why trust, preprocessing, and reuse matter.
- The left panel lists objects but does not show their relationship.
- The right panel maps terms but does not include a concrete example; it asks the audience to memorize names before seeing why the names matter.

#### Slide 11: "Tokamak zk-EVM 전체 흐름"

- The component pipeline is visually simple, but it compresses too many roles into one line.
- The `+` between `qap-compiler` and `synthesizer` is ambiguous: it is not clear whether the compiler runs together with the synthesizer or produces an artifact consumed later.
- `prover / verifier` are combined into one box even though their roles are different.
- The four small cards below repeat the same names without adding a clearer input-output contract.
- The slide names implementation packages before the conceptual model is stable.

#### Slide 12: "두 compiler는 서로 다른 질문에 답한다"

- The two-column structure is useful, but it is text-heavy and still uses implementation labels before showing a concrete example of the two compiler outputs.
- "Library compiler" and "execution record compiler" are good conceptual labels, but the slide does not show the artifact boundary between them.
- The distinction "before any execution record" vs "for one execution record" should be the visual center, not just a bullet.
- The phrase "output depends on execution record" is correct but too abstract; the audience needs to know whether the output is a circuit, witness, value connections, or all of these.

#### Slide 13: "Field-programmable circuit idea"

- This is one of the most important conceptual slides, but the visual equation is too abstract.
- `fixed library`, `block layout`, and `value connections` are not illustrated with even a tiny block diagram.
- The slide mixes paper-level terminology with Tokamak-level terminology without clarifying which layer is being discussed.
- The phrase "derived circuit" is close to "검증 회로" but does not use the same term, which weakens terminology consistency.
- The audience cannot yet see how value connections differ from arithmetic checks.

#### Slide 14: "이제 기술 용어를 붙인다"

- This slide largely repeats slide 10, but with `subcircuit library`, `placement`, and `wire map / permutation`.
- The tags `before execution record` and `chosen from execution record` are useful but remain abstract.
- `permutation` appears as a term before the audience has seen why equality connections need a separate representation.
- The slide lacks a concrete "same value appears in two blocks" example.
- It should probably be merged with a visual example rather than stand alone.

#### Slide 15: "local correctness와 interconnection correctness"

- The core distinction is important, but the slide uses generic formulas (`x + y = z`, `A.out = B.in`) without tying them to EVM execution.
- `local relation`, `copy constraints`, and `wire value equality` are introduced in English-heavy technical language.
- The slide does not connect local correctness to block selection, or copy correctness to value connections from the execution record.
- The audience may understand the formulas but still not understand how the synthesizer uses them.

#### Slide 16: "EVM 트랜잭션의 실행 기록이 block layout과 value connections를 만든다"

- This is the first direct explanation of execution-record-to-circuit derivation, but it appears after many abstract slides.
- The left panel says the execution record tells the next operation, but gives no sample operation.
- The right panel lists stack, memory, calldata, storage, and return data, but does not show a value moving through them.
- The slide should be a visual two-track example; as written, it is another bullet summary.

#### Slide 17: "Tokamak zk-EVM synthesis pipeline"

- The pipeline is helpful but generic.
- The input lane omits Solidity-compiled bytecode wording from the plan and says only `EVM bytecode`.
- The middle lane says `operation observed`, `block selected`, `values tracked`, but does not show who observes or how the observation becomes a block copy.
- The output lane contains `witness`, `value connections`, and `public instance`, but the next slide repeats these objects.
- This slide and slide 18 should probably be merged or rewritten as a concrete example plus outputs.

#### Slide 18: "생성물은 무엇을 의미하는가"

- The slide defines outputs, but it is too generic to be memorable.
- `witness-oriented data` is an implementation-flavored phrase; the audience likely needs "values used inside the verification circuit."
- `public instance` is not tied to what the verifier learns.
- `value connections` is the best item, but still lacks a picture.
- This slide should either be attached to the pipeline slide or replaced by a labeled output diagram.

#### Slide 19: "`mintNotes1`: Solidity-level logic"

- The example starts with a Solidity behavior list before explaining why `mintNotes1` is the chosen pedagogical example.
- The list is too source-code-like: output note, amount, owner, encrypted-note salt, note commitment, vault debit, duplicate rejection, event.
- The right panel's "why good example" is useful but too late; it should frame the slide before the details.
- There is no visual grouping of the function into stages such as input, note construction, accounting, storage, output.
- For introductory students, this slide risks becoming a smart-contract walkthrough rather than a circuit-derivation example.

#### Slide 20: "`mintNotes1` 실행 기록은 어떤 검증 목표로 나뉘는가"

- The lane diagram is promising, but the verification goals are still broad labels without a visible relation to reusable blocks.
- The placement count `165` and permutation entries `3710` are implementation findings; they distract from the conceptual explanation in the main flow.
- The slide does not show how one goal maps to one or more reusable block families.
- The audience cannot tell whether the numbers are important, surprising, or just incidental.
- These metrics should move to speaker notes or backup unless they support a specific point.

#### Slide 21: "왜 같은 trusted circuit을 재사용할 수 있어야 하는가"

- This slide contains the central reuse argument, but it arrives after a long technical chain and still assumes the audience understands trusted circuits.
- The on-chain verifier paragraph is important but abstract.
- The rule is correct, but "same kind/count/connections" should be illustrated with two function calls that either preserve or change the shape.
- `placement topology` appears in the callout after the plain rule, which is acceptable, but the slide does not visually connect the term to the rule.
- The slide should become the main design constraint slide rather than another text-heavy explanation.

#### Slide 22: "어떤 contract entry가 같은 circuit을 재사용하기 쉬운가"

- The examples are useful, but the split into "Likely reusable" and "Likely not reusable" is too coarse.
- The slide does not clearly explain the conditionally safe case: input-dependent branch or loop can be acceptable if successful executions preserve the same shape.
- Some examples are still vague: "validation 후 하나의 successful path만 허용" needs a concrete example.
- The slide should use three concrete mini-contract shapes: safe, unsafe, conditionally safe.

#### Slide 23: "variable note count를 fixed-arity functions로 쪼갠다"

- The matrix is visually useful but unexplained.
- It assumes the audience understands private-state DApp function families and arity.
- The callout uses "row" even though the matrix is not obviously organized by rows; this can confuse the viewer.
- The slide does not explicitly say that each function selector can have its own trusted circuit.
- This slide should be connected more clearly to the reuse condition from slide 21.

#### Slide 24: "잘못된 circuit shape를 신뢰하면 무엇이 깨지는가"

- The three failure modes are valid, but they appear before the audience has seen a positive example of correct shape reuse.
- `wrong shape`, `nondeterminism`, and `unsafe fallback` are terse labels that need concrete failure examples.
- The slide mixes soundness risk, determinism risk, and engineering fallback risk without ranking them.
- The final callout is good but should follow a concrete "bad derivation" example.

#### Slide 25: "오늘의 핵심 정리"

- The summary still contains mixed English/Korean and implementation terms: reusable blocks, copy constraints, successful circuit shape, trusted circuit.
- It summarizes the current deck rather than the revised conceptual story.
- The final sentence "Values may vary; the successful circuit shape must not" is good, but it is in English and should be translated or visually highlighted.
- The slide should reduce to three Korean takeaways.

#### Slide 26: "Q&A를 위한 질문"

- This is acceptable as a discussion slide, but it is not necessary in the main narrative.
- The questions still use terms that the current deck has not made intuitive enough: universal machine circuit, public instance, same trusted circuit reuse.
- It should be converted into speaker prompts or moved after a stronger conclusion.

#### Slide 27: "복잡한 EVM call 구조를 Synthesizer가 다루는 방식"

- This is correctly marked as backup, but the slide still assumes familiarity with parent/child call context.
- The diagram is too abstract: it does not show calldata copying or return-data copying as value connections.
- The bullet "call tree를 새로 추측하지 않는다" is useful and should be kept.
- This slide should stay in backup, but with a more explicit dataflow picture if retained.

#### Slide 28: "EVM opcode family별 처리 직관"

- This is backup material and should not be part of the main story.
- The table is dense and mixes opcode families, synthesis intuition, and reuse-shape risks.
- It may be useful for Q&A, but the main deck should not depend on it.
- If kept, it should be explicitly labeled as "reference only" and not treated as an explanatory slide.

#### Slide 29: "주요 출처"

- The reference slide is adequate, but it groups sources broadly.
- It still says web metrics were accessed 2026-06-14, while later market updates and edits used 2026-06-15.
- The final references should match the actual sources used in the rewritten deck.

### Global Rewrite Rules

- Use "검증 회로" consistently for the audience-facing object being generated.
- Use "EVM 트랜잭션의 실행 기록" consistently instead of "replay" in audience-facing text.
- Keep `statement`, `witness`, `public input`, `subcircuit`, `placement`, and `permutation` only where they are defined or immediately used.
- Every slide after slide 5 must answer one visible question. If a slide cannot be summarized as one question and one answer, split or rewrite it.
- Every technical term must be introduced in this order:
  1. plain Korean intuition;
  2. simple visual example;
  3. technical term;
  4. Tokamak mapping.
- Avoid mixed-language phrases when a clear Korean phrase is available. Keep English only for established proof-system or implementation terms.
- Do not show implementation package names before the audience understands the conceptual role.
- Do not use dense tables in the main body unless the table directly supports a comparison the audience can understand in under 20 seconds.
- Move detailed implementation mapping, opcode families, and call-context details to backup slides.
- Keep each main slide to at most two visual regions plus one short takeaway.

### Revised Narrative Backbone

The technical story after slide 5 should be:

1. A verification circuit checks a proposed execution path; it does not search for the path.
2. Different successful executions of the same bytecode can need different checks.
3. Other systems commonly constrain an execution trace with a large fixed machine-like circuit.
4. Tokamak's key idea is to assemble a function-specific verification circuit from reusable circuit blocks.
5. The paper model explains this as fixed blocks plus a chosen block layout plus value connections.
6. Tokamak maps this model to `qap-compiler` and `synthesizer`.
7. The synthesizer follows the EVM transaction execution record and produces witness data plus value connections.
8. The private-state `mintNotes1` example shows what this looks like for one function.
9. Circuit reuse is possible only for contract entries whose successful executions preserve the same block layout and value-connection shape.
10. Backup slides answer implementation questions such as call structure and opcode families.

### Slide-Group Rewrite Plan

#### Slides 6-8: From Verification To Tokamak's Question

- Current problem:
  - Slide 6 jumps from NP verification to execution-path variability, but the connection to function-specialized verification circuits is not explicit enough.
  - Slide 7 compares projects before the audience has a stable mental model.
  - Slide 8 uses an analogy but still contains unexplained terms such as reusable blocks and transcript.
- Revision:
  - Slide 6 should become "검증 회로는 실행 경로를 찾지 않고 확인한다."
    - Visual: `candidate execution path -> checks -> accept/reject`.
    - Takeaway: if the path changes, the checks may change.
  - Slide 7 should become "다른 zkEVM들은 실행 기록을 어떻게 고정된 검증 문제로 보는가."
    - Keep Scroll, Linea, Aztec only.
    - Use three simple cards, not a dense table.
    - Emphasize the contrast: trace-as-witness, machine-like constraints, or privacy-first private-function proof composition.
  - Slide 8 should become "Tokamak의 질문: 필요한 검사 블록을 어떻게 고르는가."
    - Visual: fixed block shelf -> selected blocks -> connected worksheet.
    - Remove "solved transcript"; use "EVM 트랜잭션의 실행 기록."

#### Slides 9-15: Concepts And Paper Model

- Current problem:
  - Vocabulary, intuition, components, two compilers, paper model, technical names, and obligations are all separate, but the progression feels repetitive and abstract.
  - The deck introduces terms before showing why the terms are needed.
- Revision:
  - Merge the current "Intuition First" and "Technical Names" material into a two-step explanation:
    - Slide A: plain objects: reusable block, block copy, value connection.
    - Slide B: technical names: `subcircuit`, `placement`, `permutation`.
  - Move `qap-compiler` and `synthesizer` after the plain block model.
  - Reframe the paper slide around one visual equation:
    - `fixed block library + selected block copies + equality connections = function-specific verification circuit`.
  - Replace "local correctness / interconnection correctness" with a concrete miniature example:
    - one arithmetic block produces a value;
    - another block consumes the same value;
    - local checks verify each block;
    - the connection check verifies they share the same value.

#### Slides 16-18: Tokamak Components

- Current problem:
  - The component diagram names packages but does not clearly state what each component receives and emits.
  - The two-compiler slide is conceptually right but text-heavy.
- Revision:
  - Use one pipeline slide with four boxes:
    - `qap-compiler`: fixed reusable block library.
    - `synthesizer`: EVM bytecode + EVM transaction execution record + public/private inputs -> witness + value connections.
    - `prover`: proof.
    - `verifier`: proof check against accepted circuit and public input.
  - Use a second slide only for the two compilers:
    - left: library compiler, runs before any concrete execution record;
    - right: execution-record compiler, runs for one concrete execution record.
  - Keep terms "witness" and "permutation" only as outputs, with one short definition each.

#### Slides 19-21: Synthesizer Mechanics

- Current problem:
  - The synthesizer pipeline and generated-object slides are too generic.
  - The audience still may not know how the execution record becomes block layout and value connections.
- Revision:
  - Add a simple running example with 3-4 EVM-like operations:
    - stack value appears;
    - arithmetic block selected;
    - memory/storage operation selected;
    - same logical value connected across blocks.
  - Visual should show two synchronized tracks:
    - execution-record events;
    - generated block copies and value connections.
  - Keep the technical claim:
    - the synthesizer does not invent the path;
    - it follows the observed execution record and records the verification obligations.

#### Slides 22-24: `mintNotes1` Example

- Current problem:
  - The example appears suddenly and lists Solidity behavior without first explaining what the example is supposed to demonstrate.
  - The composition slide likely contains too many named obligations for first-time listeners.
- Revision:
  - Introduce the example with one purpose:
    - "This function is useful because it combines calldata decoding, note commitment creation, balance accounting, storage update, and event output."
  - Split the example into two slides:
    1. What the Solidity function does, with a small process diagram.
    2. What the verification circuit must check, grouped into 4 broad goals:
       - transaction/function binding;
       - local EVM computation;
       - storage/accounting consistency;
       - output/event consistency.
  - Keep placement counts and implementation findings in speaker notes or backup, not on the main slide.

#### Slides 25-27: Circuit Reuse Condition

- Current problem:
  - The reuse condition is important but currently appears after many technical slides, and the contract-shape examples risk feeling like a list of exceptions.
- Revision:
  - Present the reuse condition as the central design rule:
    - "All successful executions of the supported function must need the same kinds of blocks, the same number of blocks, and the same value connections."
  - Use three concrete examples:
    - safe: fixed-arity function;
    - unsafe: input-dependent loop with variable successful length;
    - conditionally safe: branch exists but every successful path converges to the same circuit shape.
  - State explicitly:
    - failed transactions are outside this reuse guarantee;
    - Tokamak zk-EVM does not automatically support every smart contract.

#### Slides 28-29 And Backup Slides

- Current problem:
  - Q&A and backup slides are mixed with main-flow material.
- Revision:
  - Main conclusion slide should contain only three takeaways:
    1. Tokamak generates function-specific verification circuits from reusable blocks.
    2. The synthesizer follows the EVM transaction execution record and creates witness/value-connection data.
    3. Reuse is valid only when successful executions preserve the same circuit shape.
  - Move call-structure explanation and opcode-family table to clearly marked backup slides.
  - Backup slides may be denser, but must still respect the 14 pt minimum.

### Visual Design Plan For The Rewrite

- Replace abstract tables with card comparisons or two-lane diagrams.
- Use the same visual grammar throughout:
  - gray blocks: fixed reusable library;
  - green blocks: selected block copies;
  - red or orange lines: value connections;
  - blue blocks: proof-system objects.
- Use short Korean headings, not implementation labels, as the first line in each visual.
- Use source notes only for references, never for presenter instructions or interpretive comments.
- Keep references in footers minimal; move long source lists to the final references slide.

### Acceptance Checklist

- Slides 6-29 should be understandable without the presenter reading implementation details aloud.
- Each slide should have a clear answer to "What should the audience learn here?"
- No slide should introduce more than two new technical terms.
- "EVM 트랜잭션의 실행 기록" must be used consistently in audience-facing text.
- "검증 회로" must be used consistently for the generated circuit object.
- The `qap-compiler` / `synthesizer` distinction must be explained only after the reusable-block model is clear.
- The `mintNotes1` example must illustrate the model, not become a source-code walkthrough.
- Backup slides must be clearly separated from the main narrative.
- All visible text must remain at least 14 pt.
- After rewriting, run a full pass for terminology consistency, slide-title clarity, and duplicate content.

## Audience

The audience is graduate students who are studying zero-knowledge proofs and SNARKs at an introductory level. They should be assumed to know basic ideas such as arithmetic circuits, witnesses, public inputs, and the prover-verifier split, but not the Tokamak zk-EVM implementation or the field-programmable SNARK construction.

## Goal

Create seminar presentation material explaining how Tokamak zk-EVM derives a circuit from a library of small reusable circuit blocks when an Ethereum program execution replay is given.

The presentation must also explain which Ethereum contract functions can reuse the same trusted circuit across different successful transactions. This point should be treated carefully: Tokamak zk-EVM should not be presented as applying to all smart contracts. The usable case is a contract entry whose successful executions always need the same kinds of circuit blocks, the same number of those blocks, and the same connection pattern, even when the actual values change.

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
- When explaining the `synthesizer`, describe its inputs at the level of `subcircuit library`, Solidity-compiled EVM bytecode, and `public/private instance`, and its outputs at the level of `witness` and value connections, with `permutation` introduced only as the technical representation of those connections.
- Detailed artifact names such as generated JSON filenames may be kept in speaker notes or internal planning references only when they clarify implementation mapping; they should not be central slide content.
- Terminology slides must define only the terms needed for the next few slides.
- Audience-facing slides should introduce intuition before specialized terms. Prefer "small circuit blocks," "block layout," and "value connections" before terms such as `subcircuit`, `placement`, `topology`, `wire map`, or `permutation`.
- Do not use a specialized term on an audience-facing slide before either defining it or pairing it with a plain-language phrase.
- When discussing reuse, prefer the plain expression "the same kinds of blocks, the same number of blocks, and the same connections." Use `placement topology` only after that intuition is established.
- Define `trusted circuit` the first time it appears: a fixed circuit that has already been reviewed, preprocessed, and accepted by the verifier workflow.
- No claim should imply that every input to the same EVM bytecode yields the same derived circuit. The deck must state the required invariance assumptions explicitly.
- The deck must state that failed transaction paths are out of scope for the same trusted circuit reuse discussion.
- The deck must state that input-dependent loops or conditionals are not automatically disallowed; they are disallowed only when successful executions can vary the needed block layout or value connections.

## Primary Sources

### Academic Source

- `~/downloads/2024-507.pdf`
- Web archive: `https://eprint.iacr.org/2024/507`
- Short URL: `https://ia.cr/2024/507`
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

### External Solidity Sources For The Private-State Examples

Use these sources for the private-state `mintNotes1` walkthrough and the private-state DApp function matrix. The local synthesizer fixture is in this repository, but the Solidity source currently lives in the related contracts repository.

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

Tokamak zk-EVM does not derive a circuit by compiling the whole EVM program from scratch for every replay. Instead, it starts from a fixed library of small reusable circuit blocks. A replay determines which blocks are used, how many copies are needed, what values flow through them, and which values must be connected as equal. After this intuition is clear, the technical terms can be introduced: the blocks are `subcircuits`, their copies are `placements`, and the equality connections are represented by a `wire map` or `permutation`.

For on-chain use, avoid introducing a second circuit term. The practical point is simpler: a trusted circuit, meaning a fixed circuit already reviewed, preprocessed, and accepted by the verifier workflow, can be reused for the same contract entry only when every successful call needs the same block types, block counts, and value connections. This is not a claim that one circuit covers an arbitrary contract.

## Conceptual Model To Teach

1. A subcircuit library is a fixed set of small arithmetic constraint systems; in the first explanation, call these small reusable circuit blocks.
2. A replay is a deterministic execution record of a program under a concrete state and input.
3. A synthesizer maps replay events to selected block copies; later introduce the technical term `placements`.
4. Each placement is an instance of a subcircuit with input wires, output wires, and internal witness wires.
5. Arithmetic constraints check that each placement satisfies its local subcircuit relation.
6. Copy constraints check that values passed between placements are consistent.
7. The copy constraints are represented by a value-connection map; later introduce the technical terms `wire map` and `permutation`.
8. The derived circuit is therefore determined by the block layout plus value connections, not by generating a new primitive circuit language from scratch.

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

### 5. Minimal SNARK And Circuit Vocabulary

- Move this section before the Tokamak component slide so the audience has the vocabulary needed to parse the component diagram.
- Define only the minimum set of terms needed for the next few slides:
  - statement: the claim the prover wants to prove;
  - witness: prover-side values that make the claim true;
  - public instance: verifier-visible statement data;
  - circuit: the arithmetic checks that decide whether the witness is valid for the statement;
  - proof: a compact object checked by the verifier instead of re-running the computation.
- Explain R1CS/QAP only at the level needed for the audience:
  - arithmetic constraints encode local computation;
  - public wires expose verifier-visible data;
  - private wires carry witness data;
  - preprocessing/setup depends on the circuit description.
- Do not introduce Tokamak package names on this slide.

### 6. Intuitive Vocabulary For Tokamak Circuit Derivation

- Add this as a low-density vocabulary bridge before the two-compiler slide.
- Purpose:
  - reduce cognitive load before the field-programmable circuit model;
  - make sure students can distinguish fixed library objects from replay-specific proof inputs;
  - avoid letting implementation names hide the conceptual roles.
- Explain only these terms in Korean in the actual deck, with English terms preserved in parentheses:
  - small reusable circuit block (`subcircuit`): a reusable arithmetic checker for one kind of local relation.
  - block copy (`placement`): one use of a subcircuit in the replay-derived circuit.
  - value connection (`wire map` / `permutation`): a compact record that two wires must carry the same value.
  - execution replay (`replay`): the concrete execution record already produced by running the EVM program.
  - trusted circuit: a fixed circuit already reviewed, preprocessed, and accepted by the verifier workflow.
- Add one compact contrast table with only three rows:
  - fixed before replay: reusable circuit blocks;
  - chosen from replay: which block copies are needed;
  - connected from replay: which values must be equal.
- Suggested warning:
  - do not define every term that will appear later;
  - do not introduce `function/arity`, metadata, buffer bounds, setup parameters, or package-internal artifacts here.
- Design constraint:
  - This should be a low-density vocabulary slide. If the table and five definitions do not fit at 14 pt or larger, split it into two slides.

### 7. Tokamak zk-EVM Components And The Two Compiler Roles

- Show the full Tokamak zk-EVM flow at a conceptual level:
  - `qap-compiler`;
  - `synthesizer`;
  - `prover`;
  - `verifier`.
- Explain the four components using the paper-first model:
  - `qap-compiler`: prepares the reusable circuit basis. Conceptually, it produces the fixed subcircuit library before any particular replay is considered.
  - `synthesizer`: compiles one concrete replay into proof inputs. At the slide level, describe its input as the subcircuit library, Solidity-compiled EVM bytecode, and public/private instance data; describe its output as witness data plus value connections, with `permutation` introduced as the technical term.
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
    - answers "what values and value connections represent this replay over the fixed library?";
    - output is replay-specific;
    - does not redefine the reusable subcircuit library.
- Suggested visual:
  - left lane: `qap-compiler` -> fixed subcircuit library;
  - right lane: bytecode + public/private instance -> `synthesizer` -> witness + value connections;
  - merge lane: library + witness/value connections -> `prover` -> proof -> `verifier`.
- Suggested analogy:
  - `qap-compiler` prints the reusable puzzle pieces.
  - `synthesizer` reads the solved execution and records the values and equality pattern for this particular puzzle.
  - `prover` proves the assembled puzzle is consistent.
  - `verifier` checks the proof without reassembling everything.
- Do not over-detail preprocessing, setup, CLI packaging, Node/Web adapters, exact JSON schemas, metadata fields, buffer bounds, or setup parameters on this slide. Mention them later only if needed for implementation anchoring.

### 8. Field-Programmable Circuit Model

- Role of this section:
  - present the paper-level abstraction only;
  - do not discuss EVM opcode handling, private-state examples, or implementation package names here.
- Introduce the paper's model:
  - fixed subcircuit library;
  - bounded number of placements;
  - public I/O wires;
  - interface wires between subcircuits;
  - internal wires inside each subcircuit.
- Show the key abstraction:
  - derived circuit = block layout plus value connections;
  - technical notation: placement sequence plus wire map.
- Explain why this reduces what must vary between executions: the library remains fixed; the replay-specific part is mostly placement and wiring.

### 9. Arithmetic Constraints vs Copy Constraints

- Role of this section:
  - separate the two kinds of constraints using a small non-EVM example;
  - avoid repeating the full field-programmable model from the previous slide.
- Explain that local correctness and interconnection correctness are different obligations.
- Local arithmetic constraints:
  - each subcircuit instance must satisfy its own relation.
- Copy constraints:
  - if placement A's output feeds placement B's input, both wires must carry the same field element.
- Explain the wire map as a compact way to record equal-value connections; mention permutation only after the equality intuition is clear.
- Use a small example with 3 or 4 subcircuits before showing any Tokamak-specific names.

### 10. From Ethereum Replay To Subcircuit Placement

- Role of this section:
  - apply the previous two conceptual slides to EVM replay;
  - explain how EVM locations and dataflow become block layout and value connections, with placement and permutation introduced as the technical terms.
- Define "replay" for the talk:
  - previous state snapshot;
  - transaction;
  - block/environment data;
  - contract code;
  - deterministic execution semantics.
- Explain that the synthesizer follows the replay and records two coupled objects:
  - block layout: which reusable block copy checks each observed operation or helper relation;
  - value connections: which block inputs and outputs must be equal because the replay says they are the same logical value.
- Compress placement tracking for the main slide:
  - the replay says what operation happened next;
  - the synthesizer chooses the matching reusable block;
  - the block checks the local relation for that operation.
- Compress value-connection tracking for the main slide:
  - the replay also says where each value came from and where it is used next;
  - the synthesizer tracks this dataflow through stack, memory, calldata, storage, call return data, and public outputs;
  - equal-value requirements are recorded as a connection map, technically serialized as a permutation.
- Map common EVM operations to subcircuit categories:
  - buffers for external/public/private inputs and outputs;
  - arithmetic/bitwise blocks;
  - hash/signature blocks;
  - state membership/update blocks.
- Suggested visual:
  - left side: replay events update symbolic locations such as stack slot, memory slice, storage key, and return buffer;
  - middle: each event creates or consumes block wires;
  - right side: equal logical values are grouped into value-connection cycles;
  - caption: "blocks verify local relations; value connections verify that the replay dataflow connects the same values."
- Keep names illustrative rather than exhaustive.

### 11. Repository-Grounded Implementation View

- Present a compact pipeline:
  - subcircuit library artifacts are generated and packaged;
  - synthesizer consumes high-level bytecode and public/private instance data with the fixed library;
  - synthesis emits witness-oriented data and value connections, technically represented as a permutation;
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
  - show how those goals are covered by groups of reusable blocks and connected by equality requirements.
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
  - show role groups first, not raw subcircuit names:
    - transaction and signer binding;
    - local Solidity/EVM execution;
    - hash and note-commitment computation;
    - storage/state transition;
    - public output exposure.
  - explain that the connection map links equal values across these groups so that a value produced in one block is the same value consumed later.
  - keep exact subcircuit names out of audience-facing main slides unless the slide has enough room and the names serve a clear explanatory purpose.
- Suggested visual:
  - left: "`mintNotes1` transaction replay";
  - middle, four horizontal lanes:
    - transaction and signer binding;
    - Solidity/EVM local execution;
    - hash, commitment, and storage-key computation;
    - state transition and public outputs;
  - right: "witness + value connections";
  - bottom annotation: "local constraints check each box; value connections check equality between boxes."
- Speaker-note facts from the actual synthesizer run:
  - the fixture replay completed with 165 placement instances;
  - the subcircuit count was `ALU1: 88`, `VerifyMerkleProof: 36`, `ALU2: 15`, `Poseidon: 12`, `JubjubExpBatch: 4`, `DecToBit: 2`, `Accumulator: 2`, `EdDsaVerify: 1`, and five buffer placements;
  - the permutation had 3710 entries and passed the permutation check;
  - the EVM step log contained 628 rows, including `KECCAK256`, `SLOAD`, `SSTORE`, `CALL`, and `LOG1` events relevant to the function narrative.
- Keep these details out of the main slide unless there is enough room at 14 pt or larger:
  - exact subcircuit-name lists;
  - raw placement JSON;
  - exact transaction calldata;
  - full opcode histogram;
  - implementation class or handler names.
- Caution for wording:
  - do not claim that Solidity `keccak256` is literally checked by a Keccak subcircuit in this run; describe the placement-level fact as hash-related obligations represented by `Poseidon` placements;
  - do not claim that every call to the same bytecode yields the same placement list.
- Transition to the same trusted circuit reuse section:
  - state that `mintNotes1` is not the whole private-state DApp story;
  - it is one fixed-arity entrypoint used as a concrete walkthrough;
  - later, the private-state DApp matrix will show that each mint, transfer, and redeem arity needs a separate trusted circuit.

### 13. What Makes The Output Circuit Replay-Dedicated

- The replay fixes:
  - which operations occurred;
  - how many times they occurred;
  - which subcircuit type represents each operation;
  - the dataflow edges between operation outputs and later inputs;
  - public instance values and descriptions.
- Values can affect witnesses without changing the circuit only when they do not change placement or wiring.
- Values change the circuit when they alter the execution trace shape.
- Clarify reuse without adding a second circuit term:
  - a circuit is first derived from one successful replay;
  - the same trusted circuit can be reused for the same contract entry only if all successful replays preserve the same block types, block counts, and value connections;
  - after this is clear, state the technical phrase: identical placement topology and compatible interface layout;
  - this is the bridge from replay-specific derivation to reusing the same trusted circuit.

### 14. Which Contracts Can Reuse The Same Trusted Circuit?

- Replace the earlier "same program, same circuit" framing with a simpler reuse question:
  - given one trusted synthesizer output for a contract entry, can that same circuit be reused for every successful call to the same entry?
- Explain why this matters:
  - the on-chain verifier can check a proof for a fixed public statement and proving key, but it cannot independently validate an arbitrary newly generated synthesizer output as part of normal contract verification;
  - therefore one trusted/preprocessed output must be reusable for the intended set of successful calls;
  - if each transaction required a different block layout or connection pattern, the system would need a different derived circuit and the reusable on-chain verification story would break.
- State the same trusted circuit reuse condition:
  - plain version for the main slide: every successful replay must use the same kinds of blocks, the same number of blocks, and the same value connections;
  - technical version for speaker notes or a bottom caption: the placement topology and public/private interface layout must remain compatible;
  - witness values may change, but they must not change the block layout or connection pattern.
- State the scope explicitly:
  - failed transaction paths are not considered in this reuse rule;
  - Tokamak zk-EVM should not be presented as applicable to all Ethereum smart contracts;
  - it applies to contract entries whose successful paths keep the same circuit shape.
- Give the nuance:
  - input-dependent loops or conditionals are not automatically impossible;
  - they can still be usable if all successful transactions have a deterministic execution path with the same block layout and connections after contract-level validation;
  - for example, a conditional that rejects unsupported inputs and allows only one successful path can remain compatible with the same trusted circuit.
- Split this material into two slides in the final deck:
  - Slide A: examples of when the same trusted circuit can or cannot be reused;
  - Slide B: private-state DApp fixed-arity function matrix.
- Slide A, likely usable examples:
  - fixed-arity minting such as one-note minting: the value changes, encrypted note data changes, and storage keys change, but the successful replay still follows the same operation shape;
  - fixed-shape token transfer: sender, receiver, and amount change, but the same balance checks, two balance updates, and event emission occur on every successful path;
  - bounded single-slot update: a mapping key and value change, but each successful transaction performs the same key computation, one read, one write, and one event;
  - validation-then-single-path contract: many invalid inputs revert, but every successful input passes validation and enters one common execution path.
- Slide A, likely not-usable examples:
  - batch transfer where the number of recipients controls the loop count;
  - array-processing contracts where successful calls process a variable-length list;
  - a function whose successful branches execute different external calls or different numbers of storage writes;
  - router-like contracts where input selects a different target contract or call depth;
  - contracts whose successful path emits a variable number of logs or returns variable-shaped data.
- Slide A, borderline examples to explain carefully:
  - an input-dependent conditional is usable if both successful branches use the same block layout and connections, or if only one branch can succeed and the other reverts;
  - a loop over user data is usable only if the successful executed iteration count is fixed or the contract uses a fixed executed shape with dummy/no-op positions;
  - dynamic storage keys are usable when the number and order of storage operations remain fixed; they are not usable when the access pattern length or order changes across successful transactions.
- Slide B, private-state DApp concrete example:
  - use the Tokamak private-state DApp as the closing example, not only `mintNotes1`;
  - show that the DApp contract defines separate fixed-arity entrypoints instead of one variable-size note operation;
  - explain that each entrypoint/function selector needs its own trusted circuit because it uses a different block layout and connection pattern.
- Private-state DApp function families to show:
  - mint circuits:
    - `mintNotes1`, `mintNotes2`, `mintNotes3`, `mintNotes4`, `mintNotes5`, `mintNotes6`;
    - each function has a different output arity, so the number of note preparations, commitment registrations, logs, additions, and storage updates differs;
    - therefore `mintNotes1` and `mintNotes6` should not be presented as sharing the same derived circuit.
  - transfer circuits:
    - `transferNotes1To1`, `transferNotes1To2`, `transferNotes1To3`, `transferNotes2To1`, `transferNotes2To2`, `transferNotes3To1`, `transferNotes3To2`, `transferNotes4To1`;
    - the input/output note arity determines the number of nullifier checks, commitment checks, value-sum checks, storage updates, and encrypted-note logs;
    - each arity pair needs a different trusted circuit.
  - redeem circuits:
    - `redeemNotes1`, `redeemNotes2`, `redeemNotes3`, `redeemNotes4`;
    - the input note arity determines the number of nullifiers, value accumulation steps, and the final accounting-vault credit path;
    - each redeem arity needs a different trusted circuit.
  - supporting accounting-vault calls:
    - `debitLiquidBalance` appears in mint paths;
    - `creditLiquidBalance` appears in redeem paths;
    - these support calls affect the call/storage shape of the corresponding entrypoint circuit.
  - public helper functions:
    - `computeNoteCommitment` and `computeNullifier` can be listed separately as deterministic helper-style functions, but they are not the main private-state transaction classes.
- Key message:
  - the private-state DApp is usable by splitting variable note-count behavior into many fixed-arity functions;
  - this is exactly the kind of contract design that avoids one successful transaction changing the block layout of another;
  - the cost is that each function selector/arity needs its own trusted synthesizer output and proving setup path.
- Suggested slide design:
  - use a two-column table: "Same circuit likely works" vs "Same circuit likely fails";
  - use short examples, not code;
  - end with a compact private-state DApp matrix: mint arity, transfer input/output arity, redeem arity;
  - visually emphasize that rows are different circuits, not one circuit with a variable note count;
  - add one bottom-line sentence: "Values may vary; the successful circuit shape must not."

### 15. Soundness Intuition And Failure Modes

- Keep this section focused on failure modes, not on repeating the same trusted circuit reuse argument.
- Explain what can go wrong if the trusted circuit shape and the claimed contract entry do not match:
  - a proof could verify a statement for a different successful-path shape than the one the verifier thinks is being supported;
  - verifier preprocessing may bind the wrong block layout, connection pattern, or public/private interface;
  - a prover could appear to prove a supported transaction while relying on a circuit shape that was never trusted for that contract entry.
- Explain what can go wrong if the replay-to-circuit derivation is not deterministic:
  - two parties may derive different block-layout or value-connection objects for the same claimed successful replay;
  - deployment and proving infrastructure may disagree about which proving key or circuit identity is authoritative;
  - debugging becomes impossible because the same semantic transaction no longer maps to one reproducible circuit object.
- Explain why fallback logic must not hide synthesis defects:
  - unsupported shape should be rejected clearly;
  - fallback should only improve usability when the semantic statement and circuit shape remain unchanged;
  - fallback must not silently pad, skip, or reroute a transaction into a different trusted circuit.

### 16. Suggested Visuals

- Diagram 1: "fixed library" on the left, "replay trace" on the top, "chosen blocks + value connections" in the center, "SNARK proof" on the right.
- Diagram 2: block-layout table with columns: block index, block type, inputs, outputs, source values.
- Diagram 3: copy-constraint/value-connection cycles over a small set of connecting wires.
- Diagram 4: usable vs not usable successful paths:
  - usable: different witness values, same successful block layout and connections;
  - not usable: different successful branches, loop counts, calls, or storage access shapes produce different circuit shapes.
- Diagram 5: replay dataflow tracker: stack/memory/storage locations point to block wires, and repeated logical values become value-connection cycles.
- Diagram 6: `mintNotes1` replay lanes showing verification goals mapped to subcircuit groups.
- Diagram 7: private-state DApp function matrix: `mintNotes1`-`mintNotes6`, supported `transferNotesNToM` arities, and `redeemNotes1`-`redeemNotes4`, with one row per trusted circuit.
- Diagram 8: circuit reuse relationship: representative successful replay -> trusted circuit shape -> all successful calls to the same contract entry reuse the same circuit.

### 17. Planned Slide Outline

1. Title and guiding question.
2. Why EVM execution proofs matter: scalability and privacy.
3. One evidence slide: scaling still leads in size, privacy is re-emerging.
4. From application goals to arithmetic statements.
5. Why NP verification circuits can depend on the found EVM trace.
6. How selected Ethereum ZK projects turn execution into proof inputs.
7. How Tokamak's subcircuit-library approach differs.
8. Minimal SNARK and circuit vocabulary for this talk.
9. Intuitive vocabulary: reusable blocks, block copies, and value connections.
10. Tokamak zk-EVM components: qap-compiler, synthesizer, prover, verifier.
11. The two compiler roles: library compiler vs replay compiler.
12. Field-programmable circuit idea.
13. Subcircuit library, placement, and wire map after the intuition is clear.
14. Arithmetic constraints vs copy constraints.
15. Ethereum replay as a source of block layout and value connections.
16. Tokamak zk-EVM synthesis pipeline.
17. High-level generated objects and their meanings.
18. Synthesizer execution example: private-state `mintNotes1`.
19. `mintNotes1` verification goals and subcircuit-composition picture.
20. Why the same trusted circuit must be reusable for the supported contract entry.
21. Contract examples: reusable vs non-reusable successful path shapes.
22. Private-state DApp matrix: fixed-arity functions need different trusted circuits.
23. Soundness failure modes: wrong circuit shape, nondeterministic synthesis, and unsafe fallback.
24. Summary and discussion questions.
25. Backup slide for Q&A only: how the synthesizer follows complex EVM call structures.
26. Backup table for Q&A only: EVM opcode-to-subcircuit or composition mapping.

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
- Main Q&A slides should use a short opcode-family summary first. Keep the full table as speaker notes, a backup appendix, or a separate reference page.
- Source basis:
  - opcode catalog: `evm.codes` and `duneanalytics/evm.codes` `opcodes.json`, accessed 2026-06-14;
  - Tokamak mapping: `configuredTypes.ts`, `instructions.ts`, `InstructionHandler`, and `MemoryManager`.
- Table design:
  - first prepare a compact Q&A summary with roughly 5-7 rows: arithmetic/bitwise, memory/calldata/return-data, storage/state, calls, logs/outputs, environment values, unsupported paths;
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
- The deck distinguishes `qap-compiler` as the reusable-library compiler from `synthesizer` as the replay-to-witness-and-value-connections compiler.
- The deck shows `prover` and `verifier` as backend consumers of the fixed library and replay-specific synthesizer outputs.
- Terms needed for the two-compiler slide are explained before the package names are introduced.
- The terminology slide defines only the minimal terms needed for the next few slides.
- No specialized term appears on an audience-facing slide before it is defined or paired with plain language.
- The main deck explains "same trusted circuit" using "same block types, same block counts, and same value connections" before using `placement topology`.
- The term `trusted circuit` is defined as a fixed circuit already reviewed, preprocessed, and accepted by the verifier workflow.
- The Ethereum replay section explains both outputs of synthesis in plain terms: choosing reusable block copies and tracking value connections.
- The field-programmable, arithmetic/copy, and Ethereum replay sections have distinct roles and avoid repeating the same block-layout/value-connection explanation at the same level.
- The value-connection explanation makes clear that stack moves, memory copies, calldata, return data, storage reuse, and public-output exposure can create equality relations between block wires.
- The deck does not describe the synthesizer as merely listing blocks; it also tracks how values are connected across block copies.
- The `mintNotes1` example is grounded in the Solidity source and an actual synthesizer run, but the slide does not expose raw placement JSON or a full opcode histogram.
- The `mintNotes1` example explains verification goals before naming subcircuit groups.
- The `mintNotes1` subcircuit visual groups placements by role instead of showing all 165 placement instances or a long list of subcircuit names.
- The `mintNotes1` wording treats Poseidon as the hash-related subcircuit used by this run and does not claim that the run uses a dedicated Keccak subcircuit.
- The `mintNotes1` walkthrough explicitly transitions to the private-state DApp matrix by saying it is one fixed-arity entrypoint among many.
- Complex EVM call-structure material is kept as Q&A backup and does not interrupt the main explanation.
- The Q&A call-structure explanation describes per-depth context tracking and boundary checks without exposing implementation internals.
- The Q&A call-structure explanation connects dynamic calls back to circuit-stability risks.
- The opcode-to-subcircuit backup table uses `evm.codes` as the opcode catalog and the Tokamak repository as the synthesis-mapping source.
- The main Q&A opcode material starts with a compact opcode-family summary; the full opcode table remains backup/reference material.
- The opcode-to-subcircuit backup table distinguishes direct arithmetic placements from composed memory/context/storage handling.
- The opcode-to-subcircuit backup table marks unsupported opcodes explicitly and does not present fallbacks as support.
- Every implementation detail is tied back to the conceptual model.
- The deck avoids introducing a second circuit term; it explains reuse in plain language as "the same trusted circuit can be reused for the same supported contract entry."
- The deck distinguishes replay-dedicated circuits from universal-machine circuits, while explaining that replay-derived circuit shape can be reused only under a same-shape condition.
- The deck explains that the same trusted circuit can be reused only when every successful replay for the supported contract entry preserves the same block layout, value connections, and compatible interface.
- The deck states that one trusted synthesizer output must be reusable for all successful calls in the supported contract entry because arbitrary newly generated synthesizer outputs are not independently validated on-chain.
- The deck states the exact same trusted circuit reuse condition in plain language first: all successful replays for the supported contract entry must preserve the same block types, block counts, and value connections.
- The deck explicitly excludes failed transaction paths from the same trusted circuit reuse discussion.
- The deck states that Tokamak zk-EVM should not be presented as applicable to all Ethereum smart contracts.
- The same trusted circuit reuse slide uses concrete examples instead of a separate abstract design-strategy slide.
- The examples include both likely usable and likely not-usable successful-path shapes.
- The same trusted circuit reuse examples are split across two slides: general examples first, private-state DApp matrix second.
- The private-state DApp example shows all fixed-arity function families and states that different function selectors/arities need different trusted circuits.
- The private-state DApp example must not imply that `mintNotes1`, `mintNotes2`, transfer, and redeem calls share one derived circuit.
- The deck states that input-dependent loops or conditionals are usable only when successful executions still have deterministic, same-shape replay behavior.
- The deck states that different successful input-induced control flow can require a different derived circuit and therefore fail the same trusted circuit reuse requirement.
- The deck does not overclaim support for arbitrary Ethereum L1 behavior.
- Code references are used as anchors, not as the main teaching structure.
- All slide text, diagrams, speaker notes, and audience-facing examples are written in Korean, with English technical terms preserved where needed for precision.
- No audience-facing slide text is smaller than 14 pt, including labels, captions, table cells, footnotes, and source labels.

## Open Questions Before Creating The Actual Slides

- Desired seminar length: 30, 45, 60, or 90 minutes.
- Desired output format: Markdown outline, PowerPoint deck, Google Slides, or another format.
- How much of the `mintNotes1` example should be kept in main slides versus speaker notes if the final time budget is short.
- Whether to include mathematical notation from the paper directly, or keep notation mostly informal.
