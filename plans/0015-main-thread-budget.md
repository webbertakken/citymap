# Plan 0015: the main thread within the phone budget

After plan 0013 the indexes are built off the main thread, yet the phone budget (`e2e/vitals.spec.ts`, every answer
under 200 ms on the slowed phone) still misses on taps that do their own work on the main thread. This plan moves that
work off the main thread, or into slices that yield to input, until the phone budget passes 20 of 20 runs twice. Spec:
[viewer](../docs/specs/004-interface-design/viewer.md) (Web experience); blueprint:
[viewer](../docs/specs/004-interface-design/blueprints/viewer.md) (Laying and reading, Web experience); the buildings
blueprint where the lot table moves.

Where main's time goes on the phone journey (livediagram, slowed fourfold, profiled with source maps at 09b4ab8):

- a drill into apps/live: 192 ms, building the town's scene (`buildScene(focusOn(city, key))`);
- back to the whole city: 144 ms, the lot table again for the whole scene (`tableFor`) and garbage collection;
- the Buildings view: 104 ms, compiling the buildings' shader and their first draw;
- Details and Hide details: 56 to 64 ms;
- a theme change: its event answers (a transition), but the scene is rebuilt on the main thread right after, so the next
  input waits;
- opening linux: parsing its 43 MB city file (about 290 ms in one task), and the buildings and their lot table from its
  measures (`cityBuildings`, `tableFor`: about 450 ms).

## Phase 1: measure main

- [x] The phone budget on main, 20 rounds alternating with this branch's baseline (so both see the same machine load),
      twice; each miss named with its event and the machine's calibration
- [x] The phone journey profiled step by step (the drill, back, Buildings, Details, theme, the variant), and linux's
      opening, with source maps; the attribution above confirmed or corrected

## Phase 2: spec and blueprint

- [x] Spec: what a person sees while a town's scene, a theme or a colour arrives from off the main thread (nothing new,
      if the work is ready before it is asked for); the budget stated for every journey step
- [x] Blueprint: the city's worker (the opening's worker kept while its city is shown: its requests, answers, buffers,
      lifetime and failures); town scenes built ahead; the theme rebuilt there; the lot table and heights there; the
      measures read per lot on demand; the city taken in by slices; the shader warmed up; logs, constants, tests;
      DEFAULTS and COMPLETENESS

## Phase 3: the city's worker

- [x] The opening's worker stays while its city is shown and ends when another opens, on cancel, and on leaving (tests
      first, through a port with a calling-thread stand-in, as `layHere` is)
- [x] Every town's scene is built there after the city's, in the theme shown, and handed over; a drill draws the one at
      hand and builds nothing on the main thread
- [x] A theme change asks the worker for the city's and the towns' scenes in the new theme; the map keeps its colours
      until they arrive, and nothing is built on the main thread

## Phase 4: the buildings off the main thread

- [x] The lot table and the buildings' heights for a scene and a colour are made in the worker and handed over;
      switching between the whole city and a town, or the colour, builds no table on the main thread
- [x] The cards' measure rows read one lot's measures when asked, so the main thread never builds every building; the
      legend's scales come from the worker
- [x] The Buildings view's shader is compiled while the main thread is idle after the city shows

## Phase 5: the city taken in by slices

- [x] A large city crosses from the worker in pieces (the city without its lots and measures, then its lots and its
      measures in chunks), each parsed in its own task, yielding to input between them; the city equals the one parsed
      whole
- [x] Details and Hide details within budget (whatever the profile shows)

## Phase 6: proof

- [x] Unit tests at 100 %; `bun run check`
- [ ] End-to-end: the full suite; the opening spec against main; the phone budget passes 20 of 20 runs twice
      (alternating with main); linux's buildings budget
- [ ] Screenshots before and after (dark and light)
- [ ] Fold-back: spec and blueprint reconciled to what shipped; every symbol, file and reference checked
- [ ] PR with the measurements (not merged)
