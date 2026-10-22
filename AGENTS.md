# Project Architecture Decisions

- Owner dashboard presentation is scoped by the `owner-command-center` shell class so its visual system cannot leak into admin or staff views.
- BOM data lives in bom_headers/bom_lines; components are products rows with product_kind='component' so they share the single stock ledger and WAC. Why: no parallel inventory.
- Integration setting authorization uses authenticated server-side role checks for admin or owner; lookup errors fail closed so ordinary staff cannot change integration secrets.
- Query defaults never reuse previous-key data globally; brand-specific rows must not appear while a different brand's query loads.
- Offset-paginated aggregate queries use a unique row ID as their final order key so equal timestamps do not shuffle pages.
