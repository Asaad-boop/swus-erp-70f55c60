# Partial Shipment Shipping Charge (Release-wise Freight)

## Somossa ta ki

100 pcs purchase → seller 80 pcs age pathalo, 20 pcs pore. Kintu ekhon system-e shipping charge **PO level e ekta total** (weight × rate) — sheta shob 100 pcs-er upor bhag hoy. Tai:

- 80 pcs receive korar shomoy shudhu oi shipment-er freight bill dite pari na
- Landed cost per unit bhul hoy (2nd shipment-er rate/weight alada hote pare)
- "Ei release-e koto shipping due" — eta hishab hoy na

## Solution: shipping ke release (shipment) level e nia jawa

Ekta PO-er niche onek **Release** thake (already ache). Proti release e nijer weight, rate, freight ebong payment thakbe. PO-level shipping hobe shudhu **planned/estimate**, actual freight ashbe release theke.

### Calculation model

Prottek release-er jonno:

```text
Release freight  = release_weight_kg × release_rate_per_kg   (ba manual amount)
Goods due        = Σ (released_qty × unit_cost_bdt)  −  oi qty-r advance share
Advance share    = paid_advance × (release goods cost ÷ PO goods total)
Release e pay    = Goods due + Release freight + Local delivery
```

Landed cost per unit (oi release-er pcs-er jonno):

```text
unit_landed = unit_cost_bdt
            + (release_freight ÷ release_units)
            + (release_local_delivery ÷ release_units)
            + PO-level other charges share (customs/duty/other ÷ total ordered)
```

Mane: **freight ar delivery shudhu oi shipment-er pcs-er upor bhag hobe** — puro PO-r upor na. Egulai ekhon-kar bug.

PO summary te dekhabo: Planned shipping (estimate) vs Actual shipping (Σ release freight), ar Remaining pcs-er estimated freight.

## Ki ki build hobe

### 1. Database
- `imp_po_releases` e notun column: `shipping_weight_kg`, `shipping_rate_per_kg`, `shipping_charge_bdt`, `shipping_payment_id`
- `imp_purchase_orders.shipping_total_bdt` ke "actual" hishebe recompute kora hobe = Σ release shipping (trigger diye), ar `shipping_cost_bdt` thakbe planned estimate
- Purono PO gulor data intact rakha hobe: jodi kono release-e shipping na thake, agerkar PO-level bhag-i chalu thakbe (backward safe)

### 2. Release dialog (Receive at BD / Quantity release)
- Notun "Shipping / Freight" section: Weight (kg) + Rate per kg → auto amount, ba manual override
- Default weight = release units × PO-r average per-unit weight (edit kora jabe)
- Wallet select kore ekhoni pay kora jabe (already goods payment-er pashe)
- Live summary card: Goods due · Advance share · Freight · Local delivery · **Total to pay now**

### 3. Landed cost fix
`qtyPoRelease` e overhead per unit hishab bodle — release-er nijer freight/delivery oi release-er units diye bhag hobe, PO-level bakigulo (customs, duty, other) totalOrdered diye bhag hobe.

### 4. PO detail UI
- Shipping card e: Planned vs Actual vs Remaining estimate
- Releases table e notun column: Units · Weight · Rate · Freight · Landed/unit
- Prottek release-er "shipping paid / due" badge

### 5. Payment adjust
Release-er shipping payment bhul hole edit/reverse kora jabe (existing reversal flow-i use hobe), ar release row-er amount update hobe.

## Technical details

- File: `src/lib/erp/imports/imports.functions.ts` → `qtyPoRelease` (overhead per unit + shipping payment part), `getPurchaseOrder` (release select e notun column)
- Dialog: `src/components/erp/imports/` er release/receive dialog e shipping section
- Migration: `imp_po_releases` alter + PO shipping recompute trigger
- Idempotency key: `${key}:ship` already ache — release-wise freight-eo eki pattern
