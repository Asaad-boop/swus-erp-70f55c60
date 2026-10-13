# Project Architecture Decisions

- Owner dashboard presentation is scoped by the `owner-command-center` shell class so its visual system cannot leak into admin or staff views.- BOM data lives in bom_headers/bom_lines; components are products rows with product_kind='component' so they share the single stock ledger and WAC. Why: no parallel inventory.
