import { ArrowRight, CheckCircle2, Truck, Boxes, Wallet, ClipboardCheck, PackageCheck, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtBdt } from "@/lib/erp/imports/types";
import { scrollToSection, type PoMath } from "./po-math";

type Tone = "slate" | "indigo" | "orange" | "emerald";

const TONE: Record<Tone, { wrap: string; icon: string; btn: string }> = {
  slate: {
    wrap: "border-border bg-muted/40",
    icon: "bg-muted text-muted-foreground",
    btn: "",
  },
  indigo: {
    wrap: "border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/20",
    icon: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300",
    btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
  },
  orange: {
    wrap: "border-orange-200 dark:border-orange-900/50 bg-orange-50/60 dark:bg-orange-950/20",
    icon: "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300",
    btn: "bg-orange-600 hover:bg-orange-700 text-white",
  },
  emerald: {
    wrap: "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20",
    icon: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300",
    btn: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
};

type Step = {
  step: number;
  tone: Tone;
  Icon: typeof Truck;
  title: string;
  hint: string;
  cta?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
};

export function NextActionBar({
  po, cartons, math, isQtyMode,
  onCartonPlan, onBulkStage, onReceiveBd, onPayDue,
}: {
  po: any;
  cartons: any[];
  math: PoMath;
  isQtyMode: boolean;
  onCartonPlan: () => void;
  onBulkStage: (stage: "at_china_warehouse" | "in_transit" | "arrived_bd", ids: string[]) => void;
  onReceiveBd: () => void;
  onPayDue: () => void;
}) {
  const step = isQtyMode
    ? qtyStep({ po, math, onReceiveBd, onPayDue })
    : cartonStep({ po, cartons, math, onCartonPlan, onBulkStage, onReceiveBd, onPayDue });

  const t = TONE[step.tone];
  const { Icon } = step;

  return (
    <Card className={cn("p-4 border", t.wrap)}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center shrink-0", t.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] tracking-wider font-semibold">
              STEP {step.step} / 5
            </Badge>
            <span className="font-semibold text-sm">{step.title}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{step.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {step.secondary && (
            <Button size="sm" variant="outline" onClick={step.secondary.onClick}>
              {step.secondary.label}
            </Button>
          )}
          {step.cta && (
            <Button size="sm" className={t.btn} onClick={step.cta.onClick}>
              {step.cta.label}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function cartonStep({
  po, cartons, math, onCartonPlan, onBulkStage, onReceiveBd, onPayDue,
}: {
  po: any; cartons: any[]; math: PoMath;
  onCartonPlan: () => void;
  onBulkStage: (stage: "at_china_warehouse" | "in_transit" | "arrived_bd", ids: string[]) => void;
  onReceiveBd: () => void;
  onPayDue: () => void;
}): Step {
  const by = (s: string) => cartons.filter((c) => c.status === s);
  const ordered = by("ordered");
  const atWh = by("at_china_warehouse");
  const transit = by("in_transit");
  const arrived = by("arrived_bd");
  const released = by("released");
  const inStock = by("in_stock");

  if (cartons.length === 0) {
    return {
      step: 1, tone: "slate", Icon: Pencil,
      title: "Carton plan banano baki",
      hint: "Kon carton e kon item koto piece — seta age set korte hobe, tarpor stage move kora jabe.",
      cta: { label: "Carton plan banao", onClick: onCartonPlan },
    };
  }

  if (arrived.length > 0) {
    return {
      step: 4, tone: "orange", Icon: PackageCheck,
      title: `${arrived.length} carton BD te arrived — release korun`,
      hint: "Release korle supplier due + shipping bill settle hobe, tarpor QC kore stock e jabe.",
      cta: { label: "Release cartons", onClick: () => scrollToSection("cartons-section") },
    };
  }

  if (released.length > 0) {
    return {
      step: 5, tone: "indigo", Icon: ClipboardCheck,
      title: `${released.length} carton released — warehouse QC baki`,
      hint: "Carton khule count milan, tarpor inventory te post korun (sellable stock).",
      cta: { label: "QC & stock e nin", onClick: () => scrollToSection("cartons-section") },
    };
  }

  if (transit.length > 0) {
    return {
      step: 3, tone: "indigo", Icon: Truck,
      title: `${transit.length} carton in transit — BD te pouchheche?`,
      hint: "Puro PO ekshathe hole 'Receive at BD'. Ekta ekta / partial shipment hole shudhu je carton eseche shegulo 'Arrived BD' mark korun — tarpor oi carton release kora jabe.",
      cta: { label: `Mark ${transit.length} Arrived BD`, onClick: () => onBulkStage("arrived_bd", transit.map((c) => c.id)) },
      secondary: { label: "Receive at BD (full PO)", onClick: onReceiveBd },
    };
  }

  if (atWh.length > 0) {
    return {
      step: 2, tone: "indigo", Icon: Truck,
      title: `${atWh.length} carton China warehouse e ache`,
      hint: "Cargo te uthle 'In Transit' mark korun — ek click e sob gulo.",
      cta: { label: "Mark In Transit", onClick: () => onBulkStage("in_transit", atWh.map((c) => c.id)) },
    };
  }

  if (ordered.length > 0) {
    return {
      step: 1, tone: "slate", Icon: Boxes,
      title: `${ordered.length} carton ordered — supplier ready korle next step`,
      hint: "Maal China warehouse e pouchhale 'At China WH' mark korun.",
      cta: { label: "Mark At China WH", onClick: () => onBulkStage("at_china_warehouse", ordered.map((c) => c.id)) },
    };
  }

  if (math.due > 0) {
    return {
      step: 5, tone: "orange", Icon: Wallet,
      title: `Baki due ${fmtBdt(math.due)}`,
      hint: "Sob carton stock e — sudhu payment settle korte hobe.",
      cta: { label: "Pay due", onClick: onPayDue },
    };
  }

  return {
    step: 5, tone: "emerald", Icon: CheckCircle2,
    title: `PO complete — ${inStock.length} carton stock e`,
    hint: `Landed cost ${fmtBdt(math.landedPerUnit)}/pc · ${po.po_number} closed.`,
  };
}

function qtyStep({
  po, math, onReceiveBd, onPayDue,
}: { po: any; math: PoMath; onReceiveBd: () => void; onPayDue: () => void }): Step {
  const arrived = ["arrived_bd", "partially_received", "completed"].includes(po.status);

  if (!arrived && math.qtyReleased === 0) {
    return {
      step: 2, tone: "indigo", Icon: Truck,
      title: "Maal BD te eseche?",
      hint: "Shipping (kg × rate ba flat), customs, other charges din — per-piece landed cost e boshbe.",
      cta: { label: "Receive at BD", onClick: onReceiveBd },
    };
  }

  if (math.qtyRemaining > 0) {
    return {
      step: 3, tone: "orange", Icon: Boxes,
      title: `${math.qtyRemaining} pcs release baki (${math.qtyReleased}/${math.qtyOrdered} done)`,
      hint: "Joto piece hate peyechen toto release korun — baki gulo pore kora jabe.",
      cta: { label: "Release pieces", onClick: () => scrollToSection("release-section") },
      secondary: { label: "Receiving bill edit", onClick: onReceiveBd },
    };
  }

  if (math.due > 0) {
    return {
      step: 4, tone: "orange", Icon: Wallet,
      title: `Sob pcs released — due ${fmtBdt(math.due)} baki`,
      hint: "Supplier / freight payment settle korle PO close hobe.",
      cta: { label: "Pay due", onClick: onPayDue },
    };
  }

  return {
    step: 5, tone: "emerald", Icon: CheckCircle2,
    title: "PO complete — sob piece stock e",
    hint: `Landed cost ${fmtBdt(math.landedPerUnit)}/pc · full paid ✓`,
  };
}
