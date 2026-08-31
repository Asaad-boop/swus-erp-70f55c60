# Import PO Detail — Flow Fix & Cleanup

Goal: PO detail page e "ekhon amar ki kora dorkar" ta ek nojore bojha jabe, release option kokhono lukano thakbe na, ar shob number ek jaygay theke ashbe.

## 1. Next Action bar (page er sob upore)

PO er ovostha dekhe ekta bar dekhabo — ek line e ki korte hobe + ekta primary button:

```text
[ 2 ] Cartons China warehouse e ache  →  [ Mark In Transit ]
[ 3 ] Carton BD te eseche            →  [ Release & pay ৳12,340 ]
[ 5 ] Released, QC baki               →  [ Receive to stock ]
```

- Carton mode e stage onujayi, quantity mode e "koto pcs baki" onujayi.
- Button click korle related section e scroll + oi action open hobe.

## 2. Release option ar lukabe na

- Ekhon carton `Ordered` obosthay row e kono action nei — tai "release nai" mone hoy.
- Protita carton row e ekhon theke stage ladder thakbe (Ordered → China WH → In Transit → Arrived BD → Released → In Stock) with clear "Next step" button.
- Release button ta always dekha jabe, kintu carton arrived na hole disabled + tooltip: "Age carton Arrived BD mark koro".
- Bulk: header e "Select all arrived" + one-click bulk release (already ache, but visible korbo jokhon arrived carton thakbe).

## 3. Mode confusion shesh

- Carton wise / Quantity wise switch ta upore, ekta chhoto explainer soho — kon mode e ki hoy.
- Mode switch er por page ta oi mode er section-i dekhabe (onno mode er card puropuri hide).
- Jodi carton mode e kono carton na thake → boro empty state: "Carton plan banao" (already ache, aro prominent).

## 4. Shipping / freight card simplify

- Ekhon 4-5 ta box + rate mode toggle + row list ek sathe dekhay — joTil.
- Notun: default e collapsed summary — "Freight ৳73,678 · 3 shipment · rate ৳/kg". Kholele detail edit.
- Rate mode (per kg / per CBM / flat) ek jaygay, ar preview total live update.
- Shipment row gulo table-e clean korbo: Carton, Weight, Rate, Amount, Status, action.

## 5. Number/hisab thik kora

Ek jaygay canonical hishab, sob card oikhan thekei porbe:

- Ordered / Released / Remaining pcs — release items theke (damaged soho).
- Supplier paid, freight paid, due — `imp_payments` (reversed bad) theke type wise.
- Landed cost/unit = (goods + freight + local delivery + agent commission) / received pcs.
- Rounding residue (৳1 er kom) due hisebe dekhabo na (netDue already ache — sob jaygay use korbo).
- Mismatch hole card e chhoto warning chip: "PO total ar line total mile na" — chupchap bhul number dekhabo na.

## 6. Technical notes

- Notun file: `po-detail/next-action-bar.tsx`, `po-detail/po-math.ts` (shared calculation).
- Edit: `erp.imports.orders.$orderId.tsx`, `carton-row.tsx`, `cartons-header.tsx`, `carton-freight-card.tsx`, `quantity-release-card.tsx`.
- Kono database/business logic change na — shudhu UI, flow ar existing server function gulor sothik call. Kono number bhul hishab pele seta frontend calc thik kore korbo.
