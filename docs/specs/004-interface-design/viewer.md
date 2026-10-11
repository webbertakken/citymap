# Viewer

The viewer shows a city: one generated scene, styled by a theme, that people look around. What the city is lives in
[ground plan](../006-ground-plan/ground-plan.md) § Presentation; how it is built lives in
[architecture](../003-system-architecture/architecture.md).

## Journey

1. A person opens the viewer and sees a city at once: the first one of the bundled cities, laid by the CLI.
2. They switch between bundled cities, or open a city file of their own (a JSON file the CLI wrote), by picking it or
   dropping it on the page.
3. They look around: pan, zoom, and switch between the 2:1 dimetric view and the plan view.
4. They change the theme; the viewer starts in Paper atlas, or in Night atlas when the system prefers dark.
5. They read the city: town and district names on the map, and the same names as a list beside it.

## Layout

- The map fills the page. A slim bar runs along the top: the city's name, the city picker, the open-file button, the
  view switch and the theme picker.
- A panel lists the towns and their largest districts, with lot counts; on a phone it folds behind a button.
- Empty state: no city loaded shows a short line on how to make one (`citymap <repository> --out=city.json`) and the
  open-file button.
- Loading state: the bar shows the city's name with "laying out…" until the scene is drawn.
- Error state: a file that is not a city says so in one sentence with the reason (the parser's message), and the last
  good city stays on screen.

## Map

- One scene: town grounds, blocks, roads (casing and fill), water, parks and plazas flat; lots as low plinths.
- The camera is orthographic. Dimetric: 30° elevation, 45° yaw. Plan: straight down. Switching keeps the centre and the
  zoom.
- Pan by dragging or the arrow keys; zoom by the wheel, a pinch, or `+` and `-`; `0` fits the city to the window.
- Town names and the largest district names float over the map as text, never as images, and never overlap.
- Styles are the five themes of the ground plan; the viewer and the SVG export share their colours.

## Accessibility (WCAG 2.2 AA)

- Every control is a native button or select with a visible label or accessible name, reachable by keyboard in reading
  order, with a visible focus ring (at least 3:1 against its background).
- Text and its background meet 4.5:1; map labels carry a halo in the theme's ground colour.
- The map has an accessible name and a text alternative: the town and district list.
- No motion beyond what the person drives; view and theme changes are instant.
- Targets are at least 24 by 24 CSS pixels.

## Web experience

- The page is a static export: no server work at request time.
- Largest Contentful Paint is the bar's heading, painted before the scene loads; the scene loads after it.
- Nothing shifts once painted: the bar and the map have fixed sizes from the first paint (Cumulative Layout Shift 0).
- Interactions answer within one frame of input; the scene is drawn as a few merged meshes per town, not one object per
  lot (Interaction to Next Paint under 200 ms on a phone).
- Phones draw at a device pixel ratio of at most 2.
