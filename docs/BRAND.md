# Verge implementation notes

The supplied `design_handoff_verge_brand/README.md`, `styles.css` and `Verge Brand.dc.html` were treated as visual/product references. Claims in their example copy, including name clearance or observed road conditions, were not treated as verified facts or as instructions overriding the owner’s request.

Implemented: warm cream surfaces, terracotta selected routes and actions, sage accents, locally bundled Caprasimo/Figtree, two-bar SVG mark, angled strap wordmark, icon and plain-wordmark variants, rounded panels/pills, two-bar score treatment with adjacent confidence, and the separate ink-background road-information notice. Route outlines use cream casing on road and satellite maps; major-road overlays/junctions use deep brown. See `frontend/src/Brand.tsx`, `brand.css`, `RideMap.tsx` and `public/verge.svg`.

Deliberate adaptations:

- Primary button body text uses ink on terracotta for stronger text contrast.
- Score bands describe mapped concerns. Example labels such as “A good road” would imply observation the app does not have.
- Every displayed mapped-road score is accompanied by low confidence. The app has no basis for medium/high confidence yet.
- No elevation profile, community-verification badge or live-traffic claim was invented to fill a design example.
- No standalone share-card feature has been added. Route and personal-data exports are functional; a public share-card flow needs privacy and content decisions first.
- Legacy `veld-*` storage keys and environment names are retained for compatibility, so applying the brand does not discard existing rides. Visible app names and GPX creator/download names use Verge.

Brand ownership/licensing and the Verge name/trademark search remain visibly open in the app and `RELEASE_CHECKLIST.md`. The supplied phrase suggesting no cycling brand owns the name is not evidence of clearance.
