# KL-Metro Typing Branding and Web Metadata Design

## Goal

Rename the active product from **MyRapid Typing** to **KL-Metro Typing** and give
the deployed site a compact, recognizable station-roundel identity in browser
chrome, install surfaces, and link-sharing previews.

## Scope

The rename applies to active product and project surfaces:

- the visible home-screen heading;
- the HTML document title and metadata;
- package metadata in `package.json` and `package-lock.json`;
- current project documentation in `README.md`, `CONTEXT.md`, and
  `docs/STATUS.md`;
- the progress and leaderboard persistence namespaces.

Historical plans, specifications, generated design references, and their paths
remain unchanged. They describe earlier design decisions and retain the names
and filenames that were current when written.

## Naming

The display name is exactly **KL-Metro Typing**. The repository and package slug
is `kl-metro-typing`.

Persistence is intentionally reset rather than migrated:

- profile and progress: `klmetro.v1`;
- leaderboard: `klmetro.leaderboard.v1`.

Existing data stored under the old namespaces is ignored. This is acceptable
for the first public deployment and avoids carrying the former brand into the
new application contract.

## Visual Identity

The selected mark is a station roundel: a dark rounded-square field containing
a vivid rail-colored outer circle and a light station center. A short secondary
rail segment may cross the roundel at larger sizes, but the 16-pixel favicon
must retain a simple circle-with-center silhouette.

The mark uses colors already present in the application design system:

- midnight field: `#0b0f17`;
- Kelana Jaya accent: `#ed254e`;
- Ampang accent for the optional cross-rail: `#f78f1e`;
- station center: `#f8fafc`.

The master artwork is deterministic SVG so edges remain crisp and future edits
remain code-reviewable. Raster assets are derived from that artwork rather than
generated independently.

## Browser and Install Assets

The site provides:

- `favicon.svg` for modern browser tabs and address-bar suggestions;
- `apple-touch-icon.png` at 180 by 180 pixels;
- install icons at 192 by 192 and 512 by 512 pixels;
- a web app manifest referencing both install icons.

The manifest uses `KL-Metro Typing` as its full name, `KL-Metro` as its short
name, standalone display mode, `/` as its start URL, and the midnight field as
both theme and background color.

## Share Preview

The Open Graph and Twitter preview uses a 1200 by 630 pixel PNG. It combines the
station-roundel mark with the product name, the existing tagline “Type your way
across the Klang Valley.”, and restrained rail-line geometry on the midnight
background. It remains legible when reduced to a small message thumbnail.

`index.html` declares:

- a concise product description;
- canonical URL `https://kl-metro-typing.vercel.app/`;
- Open Graph title, description, type, URL, and image metadata;
- Twitter summary-large-image metadata;
- theme color, favicon, Apple touch icon, and web manifest links.

All public asset URLs are absolute from the site root so Vercel and social
crawlers can resolve them consistently.

## Testing and Verification

A focused metadata test reads the built-time source files and verifies:

- the exact product title and description metadata;
- canonical, Open Graph, and Twitter URLs;
- favicon, Apple touch icon, manifest, and preview-image references;
- manifest naming and icon declarations;
- the new storage namespaces;
- absence of the old display name from active product files.

The test must fail before implementation because the old title, storage keys,
and Vite favicon are still present. After implementation, the focused test,
full Vitest suite, and production build must all pass. The built `dist` output
is inspected to confirm every referenced public asset is emitted.

## Deployment Boundary

This change prepares the repository for the next Vercel deployment but does not
itself alter Vercel project settings or deployment protection. Deployment and
publishing remain separate explicit operations after the code change is
verified and pushed.
