# Conan Exiles Character Planner

By Crom! Plan a 3.0+ attribute build without burning a Potion of Bestial
Memory to test it.

It's a planner, not a guide. If you don't know what Scourge or Quickfooted
does, the [wiki][1] explains better than I can.

## Run it

Open `index.html`. Or:

    python3 -m http.server 8123

## What it knows

- All 6 attributes and their 5/10/15/20 perks, including the corrupted
  variants for Strength, Vitality, Authority
- Corruption is per-point — 20 Strength with 10 corrupted gives you the
  corrupted T5 and T10 perks, normal T15 and T20
- Live stat readout with perk contributions broken out (Robust, Stout,
  Scourge, Frenzy, etc.)
- Build shareable via URL hash
- No 60-point cap, for modded servers

## Data

From the [Conan Exiles wiki][1]. If a balance patch lands and I miss it,
open an issue or send a PR against `data.js`.

[1]: https://conanexiles.fandom.com/wiki/Attribute
