# Viewer

The viewer shows a city: one generated scene, styled by a theme, that people look around. What the city is lives in
[ground plan](../006-ground-plan/ground-plan.md) § Presentation; how it is built lives in
[architecture](../003-system-architecture/architecture.md).

## Journey

1. A person opens the viewer and sees a city at once: the first one of the bundled cities, laid by the CLI.
2. They switch between bundled cities, or open a city file of their own (a JSON file the CLI wrote), by picking it or
   dropping it on the page.
3. Or they name any public GitHub repository (`owner/name`, or its URL) and see its city at its default branch, laid in
   their browser in seconds; after `owner/` the viewer suggests that owner's public repositories. A link carries the
   repository, so it can be shared. A large repository shows its progress over the map while it loads.
4. Or they pick a repository's folder on their own machine (see
   [local repositories](../007-local-repositories/local-repositories.md)).
5. They look around in plan view: pan and zoom. Hovering names anything on the map and says what it means.
6. They change the theme; the viewer starts in Paper atlas, or in Night atlas when the system prefers dark.
7. They change how the city is laid out: four archetype toggles behind a settings cog, each explained by its tooltip,
   and which kinds of folder stand apart as towns of their own.
8. They read the city: town and district names on the map, and the same names as a list beside it.

## Layout

The map fills the whole page; every control floats over it on translucent ("glass") cards at the edges, so the centre
stays clear for the city.

- **Top left, the title card**: the city's name, its status (towns, lots, how it was laid), and the breadcrumb when one
  town is shown. The status wraps to a second line rather than being cut; it is never truncated.
- **Top centre, the search box**: finds folders and files of the city shown, and lays a GitHub repository when the text
  is `owner/name` or a GitHub URL. `/` puts the cursor in it from anywhere. Right beside it, the button that opens a
  local repository, where the browser can (see [local repositories](../007-local-repositories/local-repositories.md)).
- **Top right, three controls**: the theme menu, the settings cog (the layout toggles), and More (the bundled cities,
  opening a city file, opening the last local repository again). The viewer shows plan view only; the 2:1 dimetric view
  stays in the CLI's SVG export (`--camera`).
- **Right, the drawer**: what is selected, then the towns (seven, then "Show all"), each with "Show only this town". It
  can be closed to give the map the whole page. On a phone it becomes a sheet at the bottom, closed at first.
- **Bottom right, zoom**: in, out, and fit.
- **Bottom left, the legend**: what the colours mean. Hidden on a phone.
- A city fitted to the map, or a place flown to, lands in the part the cards leave free.
- Empty state: no city loaded says how to make one (`citymap <repository> --out=city.json`) or to type a repository.
- Loading state: a progress card over the map (see Loading); the status line names the phase too.
- Error state: one sentence in a notice that floats above the map and never moves anything; the last good city stays.

## Layout toggles

The settings cog opens a popover, "City layout", of four switches: the ground plan's toggles
([ground plan](../006-ground-plan/ground-plan.md) § Toggles), in this order, each with its tooltip, word for word.

| Toggle      | Default | Tooltip                                                                                                                                                            |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Corridor    | on      | when one folder holds nearly everything, the small folders beside it gather into one corner quarter behind a short avenue, instead of thin strips round the edge.  |
| Archipelago | off     | a folder of packages becomes islands, one per package, with canals and bridges between them instead of roads.                                                      |
| Quarters    | off     | many similar small folders are grouped into planned quarters, each a tidy grid of blocks square to its own outline, so you get neighbourhoods rather than stripes. |
| Tiers       | on      | a town's size sets its widest road, and only one road per town gets that class; every other road is at least one class narrower.                                   |

- Each toggle is a switch named by its toggle. Its tooltip shows beside it while the pointer rests on the switch or on
  the tooltip itself, and while the switch has keyboard focus; it is the switch's description, so a screen reader reads
  it too. Escape hides a tooltip first, then closes the popover.
- A switch takes effect at once, and the popover stays open, so several can be changed in a row.
- A bundled city shows the variant its switches name: the command-line tool lays every combination of the four toggles
  (16 cities per repository), and the viewer loads the one the switches name, as any opening loads (Loading).
- A repository laid live, from GitHub or from the person's machine, is laid again off the main thread with the chosen
  switches, under the same title.
- A city file is shown as it was written: its layout cannot change, so the switches are disabled, with the line "A city
  file keeps the layout it was laid with."
- The switches start at their defaults on every visit.
- A variant that fails to load leaves the last city in place and says so in a notice.

## Separate towns

Under the toggles, the same popover holds a second group, "Separate towns": a switch per separation
([ground plan](../006-ground-plan/ground-plan.md) § Separate towns), in the ground plan's order, each with its tooltip.

| Switch     | Tooltip                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Workspaces | every workspace member the root manifests declare is a town of its own; the manifests decide apps and packages. |
| Submodules | every submodule is a town of its own, laid from the commit it is pinned to.                                     |
| Apps       | each folder in `apps/` is a town of its own.                                                                    |
| Packages   | each folder in `packages/` is a town of its own.                                                                |
| Libs       | each folder in `libs/` is a town of its own.                                                                    |
| Crates     | each folder in `crates/` is a town of its own.                                                                  |
| Services   | each folder in `services/` is a town of its own.                                                                |
| Modules    | each folder in `modules/` is a town of its own.                                                                 |
| Extensions | each folder in `extensions/` is a town of its own.                                                              |
| Plugins    | each folder in any `plugins/` folder is a town of its own.                                                      |

- The group lists only the separations the city shown records as changing its layout; a city with none shows no group.
- While Workspaces is on and the city declares workspaces, Apps and Packages are disabled, with the line "Declared
  workspaces decide; turn Workspaces off to choose."
- The switches behave as the toggles do: at once, the popover staying open, tooltips on hover and focus, defaults on
  every visit, disabled for a city file.
- A bundled city precomputes, for each combination of the four toggles, the combinations of the separations it records;
  the viewer loads the variant its switches name.

## Search

- Typing two or more characters lists matches as they are typed: folders first, then files, each with its path, the
  matched text marked. At most seven choices show; a line says how many match in all.
- A GitHub repository typed as `owner/name` or its URL is offered too, "Lay owner/name from GitHub": first when nothing
  in the city matches, else after the matches.
- After `owner/` (or a GitHub URL up to the owner), the list also suggests that owner's public repositories (see
  Repository suggestions).
- Enter picks the first choice; ArrowDown moves into the list and the arrows move through it; Escape steps back to the
  field, closes the list, then clears the text. Picking a folder or a file flies the map to it, selects it and shows it
  in the drawer.

## Repository suggestions

- Once the text is `owner/` followed by nothing or the start of a name, the viewer asks GitHub for that owner's public
  repositories (a user's or an organisation's) and suggests those whose name starts with, then contains, what follows
  the slash, case-insensitively; ties go to the most starred.
- Each suggestion shows the repository's name with the typed part marked, its description on one line (shortened with an
  ellipsis, the whole in its accessible name), its stars, its main language, and "fork" or "archived" where true.
  Picking one lays it, as typing its full name would.
- Suggestions sit under a heading "On GitHub", after the city's own matches; with suggestions shown, the city keeps at
  most three places, so seven choices at most in all.
- An owner's list (the hundred most recently pushed) is asked for once per owner, once the text rests, and kept for ten
  minutes in the tab; so is the answer that no such owner exists. Typing more after the slash filters it without asking
  again; for an owner with more repositories than one answer holds, what follows the slash is also looked up with
  GitHub's repository search, and its finds join the list.
- A text that starts with one of the shown city's folders is a path in the city: GitHub is not asked about it.
- A repository that moved to another owner is suggested under its new owner only (`facebook/react` is now
  `react/react`); typing the old name in full still lays it, as GitHub forwards it.
- GitHub's hourly allowance is shared with laying: the list's summary says how many requests remain this hour. When the
  allowance is spent, or the owner does not exist, one line says so ("No GitHub user or organisation named x", "GitHub's
  hourly limit is reached; it resets at 14:05"), and laying the typed name stays on offer.
- Only public repositories exist here: nothing is signed in.

## Loading

- Opening anything that takes longer than 300 ms (a bundled city, a city file, a GitHub repository, a local repository)
  shows a progress card over the centre of the free map; once shown it stays at least 400 ms, so it never flickers.
- The card names what is opening and the phase it is in, in words a person knows: "Asking GitHub for the latest commit",
  "Reading the file tree", "Reading workspace manifests", "Laying out 96,000 files", "Drawing the map"; for a bundled
  city or a file, "Downloading" and "Reading the city".
- One bar runs through all phases and never moves backwards. It is determinate wherever a count is known (folders read
  of folders known, lots placed of lots, bytes of bytes) and shows the count beside it ("1,204 of 2,610 folders · 27
  requests", "31,200 of 75,663 lots"); where nothing can be counted, a gentle sweep over it, still under reduced motion.
  Once the pace is steady it estimates the time left ("about 12 s left"), and it always shows the time spent.
- "Cancel" (and Escape, anywhere but in the search box or an open menu) stops the work: requests are aborted, the layout
  worker ends, and the last city stays as it was. Opening something else while one load runs replaces it. The last city
  stays visible, dimmed, under the card while the next one loads; search, the menus and the drawer stay usable.
- A failure removes the card and says why in the notice, as elsewhere.
- The card floats: it moves nothing (CLS 0), and its progress is a `progressbar` with its value and phase as text; only
  phase changes are announced, not every step.

## Light and dark

- The interface follows the system's colour scheme, and changes with it: light glass on light, dark glass on dark.
- The map's theme starts from the same preference (Paper atlas on light, Night atlas on dark) and can be changed in the
  theme menu, independently of the interface.

## Design rules

Every control meets measurable rules:

- Targets at least 48 by 48 px on touch screens and 32 by 32 px for a pointer, 8 px apart.
- At most seven choices visible at once; more sit behind "More" or "Show all".
- Spacing on a 4 px grid (4, 8, 12, 16, 24, 32, 48).
- Feedback within 100 ms of input; transitions 150 to 400 ms; none under reduced motion.
- No layout shift: notices float, controls keep their box.
- Layers, bottom to top: the map, the marker of a found place, the map's names, the cards and controls, menus and the
  hover card, notices.
- Fonts and icons are self-hosted; nothing loads from a third party but GitHub's API.

## A GitHub repository, live

- The search box takes `owner/name` or a GitHub URL and offers to lay it; picking that offer lays it. The page address
  gains `?repo=owner/name`, and opening such an address lays that repository at once.
- The city is the repository's single state at its default branch: its tree, every file laid at once, workspace members
  from its root manifests. It is not folded over history, so it is not stable from one commit to the next; the status
  line says so ("single state, not folded").
- A submodule hosted on GitHub is read from its own repository at its pinned commit, as the tree is; one hosted
  elsewhere, or that cannot be read, is one file, `.gitlink`, in its folder (see
  [ground plan](../006-ground-plan/ground-plan.md) § Submodules). The loading card counts its requests with the rest.
- Everything runs in the browser, from GitHub's public API, without signing in. A tree too large for one answer is read
  folder by folder until complete; the loading card counts the folders and the requests as they go.
- Errors are one sentence each, and the last city stays: a repository that does not exist or is private, GitHub's hourly
  limit reached (with the time it resets), or no network.
- Laying, and building the map's shapes, run off the main thread, so the page stays responsive while a large repository
  is laid.

## Map

- One scene: town grounds, blocks, roads (casing and fill), water, parks and plazas flat; lots as low plinths.
- The camera is orthographic and looks straight down (plan view).
- Pan by dragging or the arrow keys; zoom by the wheel, a pinch, or `+` and `-`; `0` fits the city to the window.
- Town names and the largest district names float over the map as text, never as images, and never overlap. A name shown
  once is not repeated nearby, whatever its letter case (`NET` and `net` are the same name), and smaller names appear
  only as the map is zoomed in far enough to read them.
- Styles are the five themes of the ground plan; the viewer and the SVG export share their colours.

## Drill down

- Every town can be drilled into: each town's name in the drawer does it, and so does the selection of anything in a
  town. The map then shows that town alone, fitted to the window, with its own districts labelled and listed.
- A breadcrumb in the title card ("city › town") leads back to the whole city; Escape does too when nothing is selected.

## Hover and select

Everything on the map answers to the pointer. Hovering shows a card beside the pointer that names what is there and says
what it means, so a person who has never read this spec understands the map.

- **Shape of the card**: an icon for the kind of thing; its name as the title (a file's name, not its whole path); a
  line saying where it is (town › folder › subfolder); then labelled rows, plain words, one fact each. Nothing is
  repeated: a folder named "Documentation" is shown once, as the folder, never again as a description.
- **Long text**: the card is 280 to 360 px wide and grows downwards; every text wraps (paths break after a slash) and
  none is cut off or hidden. The card is placed beside the pointer by its measured size, flipped and then nudged so it
  always lies wholly inside the map, and never under the pointer.
- **What each card says**:
  - a file's lot: the file's name; where it is; what kind of file it is ("Source", "Test", "Documentation" and so on,
    with a short meaning, e.g. "Tests are kept off the map unless asked for"); how many lots its folder holds (a lot is
    the land of one file, or of a few small files of one kind, so the map counts lots, not files); its address in words,
    numbered from 1 ("No. 4 on drivers/phy/intel" for `drivers/phy/intel:0.0.0.3`), with its block and side and the note
    that a lot keeps its address for life;
  - a vacant lot: "Empty lot", and why: a file was deleted here, and the lot stays free so its neighbours never move,
    until the neighbourhood renews;
  - a park: "Park", and what it is: open land for the documentation of its folder (each document gives its folder half a
    lot of park), the folder named once: the deepest folder the city records round it (a city records its larger folders
    only, and no count of documents, so the card names no count);
  - a plaza: a square where a long road changes direction; a green: the open centre of a small settlement; a reserve
    plot: land kept free for the folder's future files;
  - a road: its class with its meaning (a lane inside a neighbourhood, a street, a collector or avenue between
    districts, the boulevard through a city, a highway between towns), and for a highway the towns it joins;
  - a folder's ground: the folder, where it is, how many lots and folders it holds, and its layout in words;
  - a town: its name, its lots and districts, and its form in words (e.g. "a radial town: districts round a centre").
- **A hint at the foot**: "Click to select" on a pointer; what selecting offers.
- The card follows the pointer, never covers it, and goes with Escape or when the pointer leaves the map.
- A click (or a tap) selects what is under the pointer: the drawer shows the same details under "Selected", where
  keyboard and screen-reader users read them, with actions: "Show only this town", "Copy path", and "Open on GitHub" for
  a file or folder when the city came from a GitHub repository. Escape clears the selection.
- Lots sit above blocks, blocks above roads, roads above the ground: the card names the topmost.
- The legend uses the same words as the cards ("Park: land for a folder's documentation").

## Accessibility (WCAG 2.2 AA)

- Every control is a native button or select with a visible label or accessible name, reachable by keyboard in reading
  order, with a visible focus ring (at least 3:1 against its background).
- Text and its background meet 4.5:1; map labels carry a halo in the theme's ground colour.
- The map has an accessible name and a text alternative: the town and district list.
- No motion beyond what the person drives; view and theme changes are instant.
- Targets are at least 24 by 24 CSS pixels.

## Web experience

- The page is a static export: no server work at request time.
- Largest Contentful Paint is text of a card (or the search's placeholder), painted before the scene loads; once the
  scene is drawn a town's label may become the largest, well within 2.5 s.
- Nothing shifts once painted: the map and every card have fixed sizes from the first paint, the controls keep their
  place whatever the city's name and status say, the empty state waits until no city is on its way, and the interface
  font arrives with a matched fallback (Cumulative Layout Shift 0).
- Interactions answer within one frame of input; the scene is drawn as a few merged meshes per town, not one object per
  lot (Interaction to Next Paint under 200 ms on a phone).
- Phones draw at a device pixel ratio of at most 2.
