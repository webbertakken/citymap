# Agents

## Organisation process

This section describes the process of organising and layering empirical information.
It guides the engineering efforts by having agents specify with sufficient detail.
The goal is for agents to become increasingly self-sufficient when working on systems they already know.

This is achieved by iteratively capturing contextual information about the domain and documenting intentions from humans.

This section is exclusively human-hand-written; agents MUST NOT edit this section directly.

### Structure

Use the following structure and rationale.

- `AGENTS.md` instructs us about **how we work**. 
- `plans/` contains plans; **exhaustive list of checkboxed steps**. 
- `docs/` holds all **documentation** files.
- `docs/README.md` is the entry point.

Within `docs/` are the following special categories:

- `specs/` contains **specifications**: _what a thing IS_.
- `specs/[...]/blueprints/` contains **blueprints**: _exhaustively documented implementation details_.
- `instructions/` contains **instruction sets**: _empirically built repeatable processes_.

**Indexes** are held inside `README.md` files. Entries look like: `- ./<file>.md - when <trigger>`.
`README.md` files open with `Follow the references below only as needed; never upfront.`

Further details below.

### Docs

- Docs are structured as `docs/<category>/<topic>.md`
- They are indexed under `docs/README.md`. 
- The docs index includes entry points to `specs` and `instructions`.
- Docs convey information in scope of the project.
- All docs SHOULD be treated as persistent documents that can be iterated on.
- Stay cognizant of the deltas of each change.
- Reuse documents where it makes sense.
- Folders of substance SHOULD hold a `README.md` with an index.
- Docs, indexes and references **MUST be continuously kept-up-to-date** throughout all work.

### Plans

- Plans live as a single Markdown file in the main checkout's `plans/` folder, numbered `0001-<topic>.md`.
- They live inside the `plans/` folder, which MAY be **gitignored** (recommended).
- Plans describe **work**, split into sequenced **phases** of checkboxed **steps**:.
  - **work** includes research, specification, building, testing, verification, definition of done, and anything else that's needed.
  - **phases** are logical increments, warranting a commit each.
  - **steps** MUST be performed with full focus, and in the highest qualitative and idiomatic way.
  - **checkboxes** MUST be checked off immediately upon completion of any step, and before starting the next step.
- A plan MAY link to blueprints and specs (encouraged), but SHALL NOT restate them.
- The last step of every plan MUST be **fold-back**; to let the documentation reflect reality, and to verify all symbols/files/references.
- Fold-back reconciles the spec to what actually shipped, then re-derives the blueprint from it.
- Plans SHALL NOT be renumbered.

**When to use plans?**

- Default to no plan. Just do the work for tasks that fit in a single sitting.
- Create a plan when asked or when work is likely to exceed one or two days. 
- Surface ambiguities and gaps before implementing, and keep refining the plan as new information arrives.

**Work plans one task at a time** 

1. Read the step, 
2. Do it the best, highest qualitative and idiomatic way possible
3. Upon completion immediately tick the checkbox; never batch ticks at the end.
4. Then move to the next step.

_Note:_ There is no need to stop in between phases; just keep going.

### Specs

- Specs live inside numbered **category folders** `docs/specs/NNN-<category>/`.
- They are indexed under `docs/specs/README.md`. 
- Specs are where design decisions are made and recorded.
- Specs describe **what a thing IS** within the domain; the definitions and specifications of **systems** or **domain concepts**.
- Specs are written in the present tense.
- Specs themselves are unnumbered.
- Specs are never task lists and carry no checkboxes.
- Spec files SHOULD be unnumbered and named by subject; a category MAY hold several related specs.
- Write the spec BEFORE implementing anything non-trivial, and keep it true afterwards.
- Iterate the existing spec rather than adding a new one on the same subject; stay cognizant of the delta each change makes.

**Category folders**

- The first five categories are reserved:
  - `001-project-vision` - the "why": problem, target audience, value proposition.
  - `002-project-scope` - the "what" and "what-not": features, high-level outline, technical constraints, non-goals.
  - `003-system-architecture` - the "how" under the hood: data flow, infrastructure, state management, and the language and runtime boundaries.
  - `004-interface-design` - the "how" at the surface: UX/UI, wireframes, user journeys, visual language.
  - `005-project-roadmap` - the "when": milestones as outcomes, phases, launch strategy. 
- Further category folders MUST BE named after a **system** or, preferably, a **domain concept**.
- Renumbering is discouraged, but allowed when every reference to it is updated in the same change.

### Blueprints

- Blueprints live in a `blueprints/` folder inside their spec's category folder `docs/specs/NNN-<category>/blueprints/`, 
- They are indexed under `docs/specs/NNN-<category>/blueprints/README.md`.
- Blueprints are the meticulously detailed natural language source holding all implementation details, written before the code exists.
- Derive the blueprint mechanically from the spec before building; it adds engineering precision, not new design.
- Derivation is one-directional and deterministic: the spec is the input, the blueprint the output.
- Change flows in one-direction and is deterministic: a spec change updates the blueprint and then the code.
- Any changes outside that are folded back into the spec and blueprint.
- Blueprints do not invent design; if the spec is ambiguous, fix the spec first rather than guess.
- Iterate the existing blueprints rather than rewriting them: change only what the spec changed, and stay cognizant of the delta.
- Blueprints SHOULD apply documented defaults, recorded as one row per default in the category's `blueprints/DEFAULTS.md`.
- A blueprint is complete only when every applicable **completeness category** is covered and checked off in `blueprints/COMPLETENESS.md`

**Completeness categories**

- **Domain and naming** - every domain term maps to one canonical identifier; synonyms are banned.
- **Behaviour and state** - every state, transition, guard, and invariant is named and reachable.
- **Interfaces and contracts** - every input and output is typed and validated, with a named rejection per failure.
- **Data and persistence** - every field is classified; snapshot, restore, and migration are defined.
- **Errors and edge cases** - every failure mode and boundary case is named with its handling; no silent path.
- **Security and trust** - trust boundaries, abuse cases, guards, rate limits etc. are stated.
- **Performance and limits** - worst-case sizes and hot-path budgets are computed against the platform limits.
- **Presentation and UX** (UI only) - layout, empty, loading, and error states, and final copy are defined.
- **Accessibility** (UI only) - contrast, ARIA, keyboard, and reduced motion meet WCAG 2.2 AA.
- **Web Experience** (Web only) - Core Web Vitals, including LCP, INP and CLS are explicitly addressed.
- **Observability** - every decision point and failure emits a log with a recognisable fingerprint.
- **Testing** - every spec rule maps to a deterministic test, traceably.
- **Constants and configuration** - every magic number is a named constant with provenance and a safe range.
- **Assets and external resources** - every asset has a source, a licence, a path, and reproducible generation.
- **Defaults ledger** - every default applied for a silent or qualitative spec has a ledger row.

For each blueprint, record the applicable categories in the topic's committed `blueprints/COMPLETENESS.md`, a simple list, one line each:

- [x] Domain and naming
- [x] Behaviour and state
- [x] Testing
- [x] Defaults

Leave out any category that does not apply; unchecked means applicable but not covered.

### Instruction sets

- Instruction sets live in `docs/instructions/<process>.md`, unnumbered and named after the process they encode.
- They are indexed under `docs/instructions/README.md`.
- Instruction sets are **reusable process memory**: _how a process is done_, not scoped to one piece of work like a plan.
- Instruction sets carry no checkboxes; a plan MAY link to one, and progress is ticked in the plan.
- Steps are **chronological**; ordered the way the work is actually done, not grouped by theme.
- Steps are **granular**; each is small enough that "did it happen?" has a yes or no answer.
- Steps are **opinionated**; taste, preferences and domain specifics are woven in, not left to model defaults.
- Only **genuine forks** (taste, preference, business knowledge) are surfaced; every other decision is written down once.
- Instruction sets grow **empirically**; gotchas, hard gained knowledge, user input or missed steps are folded back in.

