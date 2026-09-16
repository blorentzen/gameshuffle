<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI is CDS-first — never hand-roll a widget

All UI is built from CascadeDS (`@empac/cascadeds`). No Tailwind, no bespoke
UI primitives. Before building any interactive element (tabs, select, checkbox,
radio/segmented switch, chip, card, stat tile, modal, breadcrumb, accordion,
stepper, etc.), use the CDS component for it.

- Style the CDS component through its own props + small CSS overrides.
- Need behavior CDS doesn't expose? **Wrap/extend the CDS component**, don't
  rebuild it (e.g. wrap CDS `Tabs` to add URL sync).
- CDS breaking the layout is a styling task, not a reason to go custom.
- If CDS truly has no component for the need, **raise it** so a CDS-compatible
  solution can be built and added to CascadeDS. A from-scratch component is a
  last resort and must be called out explicitly, never slipped in.

Component prop types are the source of truth:
`node_modules/@empac/cascadeds/dist/types/app/components/empac/*.d.ts`.
