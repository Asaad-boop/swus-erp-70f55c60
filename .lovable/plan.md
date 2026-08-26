# Supply Chain PO Flow v2 — Order → Freight → Partial Release → Warehouse QC → Final COGS

## Ekhon ki ache (thik ache, rakhbo)

1. PO create → agent/supplier ke advance pay
2. Receive at BD → weight × rate/kg diye shipping bosano
3. Quantity release (partial, pro-rata goods due + release-wise freight, wallet theke pay)
4. Warehouse QC (good / damaged / extra) → stock adjust
5. Landed cost per unit release-wise hisab hoy

## Ki missing / kothay flow bhenge jay

| Gap | Ekhon | Ki hobe |
|---|---|---|
| Local courier charge | Release dialog-e (mal ashar **age**) | QC step-e nite hobe — mal hate ashar por, wallet select shoho |
| Final COGS | Release-er shomoy fix hoye jay | QC-r por **recompute** — damage/missing/local courier dhore final per-pc cost |
| Color/variant | Data ache kintu UI-te alada kore dekhay na | Release + QC + history shob jaygay color chip + variant-wise remaining |
| Print | Shudhu reports page-e | Release Slip, QC Report, PO Statement — branded PDF |
| Remaining visibility | Ek jaygay ekta number | Per-item per-color: Ordered / Released / QC-passed / Remaining |

## Notun flow (step by step)

```text
1. PO create        →  goods bill ৳1000, 10 pcs, advance ৳500
2. Receive at BD    →  freight ৳1000 (weight × rate)  →  total due ৳1500
3. Release 2 pcs    →  goods due share + oi 2 pcs-er freight share dekhabe
                       → pay → stock e "unconfirmed" hoye jog hobe
4. Warehouse QC     →  good / damaged / missing bosabe
                       + local courier charge + kon account theke
                       → stock final adjust → FINAL per-pc COGS dekhabe
5. Baki 8 pcs       →  ek i cycle, nijer freight + nijer courier charge
```

## Ki ki build hobe

### 1. Database (migration)
- `imp_po_releases`: `local_courier_bdt`, `local_courier_wallet_id`, `local_courier_payment_id`, `qc_local_courier_note`
- `imp_po_release_items`: `final_unit_cost_bdt` (QC-r por computed final COGS)
- QC-r por release-er unit cost recompute kore stock movement cost update

### 2. QC dialog upgrade (`release-history.tsx`)
- Item row-e color swatch + SKU + image
- Good / Damaged / Missing / Extra — clean grid, keyboard-friendly
- **Local courier section**: amount + wallet picker (AccountCombobox) + reference
- **Live "Final cost" card**: Goods + Freight + Local courier ÷ good pcs = final ৳/pc
- Confirm korle: stock adjust + courier payment post + final_unit_cost save + product cost update

### 3. Release card upgrade (`quantity-release-card.tsx`)
- Local courier field ekhan theke sore jabe (QC-te)
- Per-item variant/color wise remaining chart: Ordered · Released · Remaining
- Payment summary card porishkar: Goods due · Advance share · Freight (ei shipment) · Total to pay now

### 4. Printable documents (branded shell use kore)
- **Release Slip** — kon pcs, kon color, koto qty, freight, expected delivery
- **QC Report** — released vs received, damage/missing, local courier, final ৳/pc, signature line
- **PO Statement** — full PO: items, payments, releases, QC, landed cost summary
- Reports page-e month-wise: "ei mash e koto order / koto release / koto QC pending"

### 5. PO detail summary strip
Ordered · Released · QC done · QC pending · Remaining — ek nojore, color-wise breakdown drawer shoho

## Technical details

- Server: `src/lib/erp/imports/imports.functions.ts` → `qcPoRelease` e local courier payment + final cost recompute; `qtyPoRelease` theke local_delivery sorano (backward-compatible rakhbo, purono data intact)
- New: `src/lib/erp/imports/print.ts` — release slip / QC report / PO statement HTML, `printHtml` branded shell diye
- UI: `release-history.tsx`, `quantity-release-card.tsx`, `erp.imports.orders.$orderId.tsx`, `erp.imports.reports.tsx`
- Purono release (jekhane local delivery already release-e dewa) — sheta oi bhabei dekhabe, double count hobe na
