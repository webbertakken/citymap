# Vision

## Problem

A codebase is a place people live in for years, yet it is only ever seen as a list. File trees, treemaps and existing
code cities show what is there, but not where things are: they reshuffle when the code changes, they look like charts
rather than towns, and they treat a 15-file library and a million-line monorepo the same way. Nobody builds a mental
map of a repository from them, so nobody can say "the parser is down by the harbour, past the old town".

## Audience

- Developers who join, maintain or review a repository and want to grasp its shape at a glance.
- Maintainers and teams who want to see how their codebase grows, decays and gets replaced over time.
- Anyone with a folder: later, the same map for any local folder, not only repositories.

## Value

Citymap turns any folder hierarchy into a recognisable city: districts, streets, blocks and lots that look like a real
town and stay put as the code changes.

- **Recognisable**: the map follows how real cities are built, so it reads like a place, not a chart.
- **Stable**: small changes leave the map where it was. Neighbourhoods grow at their edges; a city only replans itself
  when the repository truly changes its approach.
- **Fitting**: a small library becomes a hamlet, a monorepo an archipelago, a monolith a city with an old town.
- **Honest about time**: history is part of the input, so old code sits at the core and new suburbs at the edge, and
  vacant and rebuilt land shows where code was replaced.
- **A city that shows health**: each file becomes a building whose size, height, windows, lit windows, rooftop
  details and colour carry the repository's dimensions (tests, test coverage, cyclomatic and cognitive complexity,
  code smells). Filters choose which dimensions show, several at once, so the state of a whole city or a single
  neighbourhood reads at a glance.
- **A city with a past**: because history is the input, the city can be replayed through time, as an animation or a
  video of the repository growing, being rebuilt and being cleared.
- **A ground for more**: the ground plan is the base for buildings, statistics, a 3D walk and games played on the city,
  such as a Monopoly-like game where players choose the town to play in (apps, packages, tools).

## Principles

- The same input always gives the same map.
- Topology comes from the folder tree; looks never feed back into it.
- Real urban form is the reference: measured dimensions, road hierarchies and districts, not invented geometry.
- Open by default: hosted publicly for any public repository, with private repositories on the owner's own terms.
