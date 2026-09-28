# ADR-0016: BlockForge Extended Avatar Catalog

## Status

Accepted

## Date

2026-09-28

## Last Verified

2026-09-28

## Decision Makers

Project owner ("add MANY MANY MANY more avatar items"); Claude Code session
(technical design and implementation).

## Summary

- **Size.** The avatar shop grows from 133 items to 908.
- **How items are made.** The new items are generated from data, not written
  one by one. A *style* is a look the 3D rig can draw. A *colour theme* is a
  named dye. An item is one style in one theme, plus hair dyes and eight new
  faces.
- **New looks.** The rig (`engine/avatar3d.js`) draws 60 new looks, spread
  across faces, shirt prints, hats, accessories, neckwear, back items and
  shoulder pets.
- **Shop.** It pages at 48 items, and its featured rows rotate daily, so the
  bigger catalog stays fast to browse and render.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript, three.js r159 vendored) |
| **Domain** | Content / UI / Rendering |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `avatar_items_test.js` (10 tests); a browser showcase rendering one of every new style in 3D |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0005 (3D rendering and avatars), ADR-0008 (limited items), ADR-0013 (thumbnail budget) |
| **Enables** | Future item drops can be a style plus a list of themes |
| **Blocks** | None |
| **Ordering Note** | `data/items2.js` loads right after `data/items.js` and before anything that reads `BF.ITEM_LIST` |

## Context

- **Too few items.** 133 items gave few choices per slot: 13 hats and 6
  shoulder items, for example. Bots also ended up dressed alike.
- **Too many to write by hand.** Hand-writing several hundred rows
  (name, price, rarity, colours, description) would be slow to review and
  would drift in pricing.
- **The shop couldn't cope.** It rendered every item at once, and a few
  hundred 3D previews at once would hurt the weak laptops ADR-0013 targets.

## Decision

### New looks in the rig

| Slot | New looks |
|------|-----------|
| Faces | happy, cool, angry, surprised, blush, smug, derp, hearts |
| Shirt prints | plaid, camo, flame, heart, dots, split, rainbow, zigzag, check, star, circuit, bolt, sport |
| Hats | top hat, cowboy, chef, party, antlers, cat ears, propeller (spins), flower crown, bucket, holiday, tiara, straw, frog, beret, graduation cap, traffic cone, knight helm |
| Accessories | eyepatch, mustache, heart shades, sunglasses, VR headset, clown nose |
| Neck | lei, necktie, gem pendant, spiked collar |
| Back | guitar, balloons (bob), quiver, tail (swishes), round shield, surfboard |
| Shoulder pets | bunny (hops), penguin (waddles), slime (wobbles), ghost (floats), bee (buzzes), owl (turns its head) |

- **Hair.** Covering hats hide the top of the hair.
- **Materials.** Transparent parts use the shared cached materials
  (`opacity`), so no per-item material is leaked.

### Generated catalog (`data/items2.js`)

- **Style rows.** Each row is
  `[style, name, base rank, creator, description, dyes]`.
  - `dyes` is either an explicit theme list (for looks with a natural
    colour, such as straw hats or halos) or a count per theme tier.
  - Counts are picked by a stable hash, so the catalog is identical on every
    load.
- **Themes.** There are 24, in five tiers:

  | Tier | Themes |
  |------|--------|
  | Everyday | Snow, Coal, Cherry, Ocean, Forest, Lemon, Mint, Bubblegum, Cocoa, Sky |
  | Seasonal | Sunset, Lavender, Ember, Frost, Toxic, Steel |
  | Premium | Royal, Neon, Golden, Obsidian |
  | Cosmic | Galaxy, Aurora, Inferno |
  | One-off | Prismatic |

- **Rarity** is the style's base rank plus the theme's tier, capped at
  Mythic. Exotic and Divine stay reserved for limited drops.
- **Glow.** Themes with a glow set `look.glow`.
- **Price** falls in its rarity band. A stable FNV-1a hash of the id picks
  the point, and the result is rounded to a tidy step.

  | Rarity | Price band |
  |--------|------------|
  | Common | 55–160 |
  | Uncommon | 160–380 |
  | Rare | 380–950 |
  | Epic | 950–2,600 |
  | Legendary | 2,600–6,500 |
  | Mythic | 8,000–22,000 |

- **Names** are "<Theme> <Style>", for example "Frost Top Hat".
  Descriptions are the style's line plus the dye phrase.
  - A generated item is dropped if its name or id is already taken, so
    hand-written items always win.
  - The limited drops are added first so their names win over generated
    dyes.
  - Names are unique platform-wide, because chat and search match items by
    name.
- **Hair** is 7 styles × 8 of 15 dyes, and neon dyes are rarer.
- **Bundles.** There are 8 new ones, each priced at 80% of its parts.
  - A bundle's rarity is at least that of its rarest part.
  - If a named dye was not generated, the part falls back to the first dye
    of the same style.
- **Limited drops.** There are 4 new ones (Aurora Tiara, Starlight Owl,
  Prism Guitar and Obsidian Knight Helm). They join the existing limited
  market.
- **Registration.** Items continue the `order` sequence, and `fresh: true`
  marks them. `BF.ITEM_THEMES` is exported for tests.

The final counts:

| Category | New items |
|----------|-----------|
| Hats | 183 |
| Shirts | 125 |
| Shoulder | 77 |
| Back | 74 |
| Accessories | 74 |
| Hair | 56 |
| Neck | 54 |
| Pants | 32 |
| Jackets | 30 |
| Shoes | 30 |
| Heads | 23 |
| Faces | 8 |
| Bundles | 8 |
| Limited drops | 4 |

### Browsing a big catalog

- **The shop grid pages at 48.**
  - "Show more" appends the next 48 in place instead of re-rendering the
    grid.
  - Changing a filter or tab resets the paging. Buying an item doesn't.
- **Featured rows show a daily pick of 16.** This covers Legendary & Mythic,
  Great deals and New arrivals (drawn from the new items), seeded by the day.
- **The avatar editor** shows 12 unowned items per slot (a daily sample)
  beside the full count and a link to the shop.
- **Creator pages** show their 24 rarest items and link to
  `#/shop?q=<creator>`, which pre-fills the shop search.

### Item previews

- **Back items** render from a three-quarter back view (`yaw` 2.55).
- **Shoulder pets** use a new `pet` crop that shifts the camera toward the
  right shoulder. Shoulder pads keep the bust crop.
- **Neck items** use a lower `neck` crop.
- **SVG fallback.** An unknown crop falls back to the bust crop.

## Alternatives Considered

### Hand-write every item
Rejected: several hundred rows of hand-set prices drift, and review cost is high.

### Random colours per item
Rejected: named themes give readable names, predictable rarity and shop
filters that make sense.

### Virtual scrolling in the shop
Rejected for now: paging is simpler, and it keeps the 3D thumbnail queue short.

## Consequences

### Positive

- Every slot has dozens of choices.
- Bots dress in far more varied outfits, because they pick from the whole
  catalog.
- New drops are one row of data.

### Negative

- Item names are formulaic compared with the hand-written originals.
- Existing bots' outfits change once, because their seeded picks now draw
  from more items.

### Risks

- A theme can clash with a style's natural colour. The looks that are
  sensitive to this (straw, halo, chef, frog, flower crown, lei and others)
  use explicit theme lists.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | "MANY MANY MANY more avatar items" | 775 new items, 60 new rig looks |
| ADR-0013 performance | The shop must stay smooth on weak laptops | Paging at 48, daily-capped rows, capped editor and creator lists |

## Performance Implications

- **Load.** Generation runs once and costs well under 5 ms.
- **Browsing.** The shop renders at most 48 previews per page. Thumbnails
  still render through the idle pump and the in-memory image cache.

## Validation Criteria

- **Unit (`avatar_items_test.js`):**
  - at least 500 new items across 13 categories
  - unique ids, names and orders
  - every new look is drawn by the rig
  - prices fall within the rarity bands and are stable between loads
  - premium dyes raise rarity by their tier
  - bundles contain real items, one per slot, at a discount
  - the new limited drops are listed
  - a new pet can be bought and worn
  - bots wear new items
- **Browser.**
  - A showcase of one item per new style (129 looks) rendered in 3D.
  - The shop pages the Shoulder tab from 48 to 84.
  - The avatar editor wears a full new outfit.

## Related Decisions

ADR-0005, ADR-0008, ADR-0013.
