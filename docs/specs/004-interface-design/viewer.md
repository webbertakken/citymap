# Viewer

The viewer shows a city: one generated scene, styled by a theme, that people look around. What the city is lives in
[ground plan](../006-ground-plan/ground-plan.md) § Presentation; how it is built lives in
[architecture](../003-system-architecture/architecture.md).

## Journey

1. A person opens the viewer and sees a city at once: the first one of the bundled cities, laid by the CLI.
2. They switch between bundled cities, or open a city file of their own (a JSON file the CLI wrote), by picking it or
   dropping it on the page.
3. Or they name any public GitHub repository (`owner/name`, or its URL) and see its city at its default branch, laid in
   their browser in seconds; a link carries the repository, so it can be shared.
4. They look around: pan, zoom, and switch between the plan view, where they start, and the 2:1 dimetric view.
5. They change the theme; the viewer starts in Paper atlas, or in Night atlas when the system prefers dark.
6. They read the city: town and district names on the map, and the same names as a list beside it.

## Layout

- The map fills the page. A slim bar runs along the top: the city's name, the city picker, the repository field, the
  open-file button, the view switch and the theme picker.
- A panel lists the towns and their largest districts, with lot counts; on a phone it folds behind a button.
- Empty state: no city loaded shows a short line on how to make one (`citymap <repository> --out=city.json`) and the
  open-file button.
- Loading state: the bar shows the city's name with "laying out…" until the scene is drawn.
- Error state: a file that is not a city says so in one sentence with the reason (the parser's message), and the last
  good city stays on screen.

## A GitHub repository, live

- The repository field takes `owner/name` or a GitHub URL; pressing Enter or "Lay" lays it. The page address gains
  `?repo=owner/name`, and opening such an address lays that repository at once.
- The city is the repository's single state at its default branch: its tree, every file laid at once, workspace members
  from its root manifests. It is not folded over history, so it is not stable from one commit to the next; the status
  line says so ("single state, not folded").
- Everything runs in the browser, from GitHub's public API, without signing in. A tree too large for one answer is read
  folder by folder until complete; the status line counts the requests as they go.
- Errors are one sentence each, and the last city stays: a repository that does not exist or is private, GitHub's hourly
  limit reached (with the time it resets), or no network.
- Laying runs off the main thread, so the page stays responsive while a large repository is laid.

## Map

- One scene: town grounds, blocks, roads (casing and fill), water, parks and plazas flat; lots as low plinths.
- The camera is orthographic. Plan, the default: straight down. Dimetric: 30° elevation, 45° yaw. Switching keeps the
  centre and the zoom.
- Pan by dragging or the arrow keys; zoom by the wheel, a pinch, or `+` and `-`; `0` fits the city to the window.
- Town names and the largest district names float over the map as text, never as images, and never overlap.
- Styles are the five themes of the ground plan; the viewer and the SVG export share their colours.

## Drill down

- Every town can be drilled into: the panel offers it on each town, and so does the selection of anything in a town. The
  map then shows that town alone, fitted to the window, with its own districts labelled and listed.
- A breadcrumb in the bar ("city › town") leads back to the whole city; Escape does too when nothing is selected.

## Hover and select

- Everything on the map answers to the pointer. Hovering shows a small card beside the pointer naming what is there:
  - a lot: its file path, its land use and its address, or "vacant" for the lot of a deleted file;
  - a block: park, plaza, green or reserve (room to grow), with its district;
  - a road: its class;
  - the ground of a town: the town, and the district under the pointer.
- The card follows the pointer, never covers it, and goes with Escape or when the pointer leaves the map.
- A click (or a tap) selects what is under the pointer: the panel shows the same details under "Selected", where
  keyboard and screen-reader users read them; Escape clears the selection.
- Lots sit above blocks, blocks above roads, roads above the ground: the card names the topmost.

## Accessibility (WCAG 2.2 AA)

- Every control is a native button or select with a visible label or accessible name, reachable by keyboard in reading
  order, with a visible focus ring (at least 3:1 against its background).
- Text and its background meet 4.5:1; map labels carry a halo in the theme's ground colour.
- The map has an accessible name and a text alternative: the town and district list.
- No motion beyond what the person drives; view and theme changes are instant.
- Targets are at least 24 by 24 CSS pixels.

## Web experience

- The page is a static export: no server work at request time.
- Largest Contentful Paint is text of the bar or the panel, painted before the scene loads; once the scene is drawn a
  town's label may become the largest, well within 2.5 s.
- Nothing shifts once painted: the bar and the map have fixed sizes from the first paint, and the controls keep their
  place whatever the city's name and status say (Cumulative Layout Shift 0).
- Interactions answer within one frame of input; the scene is drawn as a few merged meshes per town, not one object per
  lot (Interaction to Next Paint under 200 ms on a phone).
- Phones draw at a device pixel ratio of at most 2.
