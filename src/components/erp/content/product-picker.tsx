import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProductLite } from "@/lib/erp/content/content-data";

/**
 * Searchable product assign control used across Content Engine
 * (new content sheet, item detail sheet, bulk assign).
 */
export function ProductPicker({
  products,
  value,
  onChange,
  placeholder = "Product assign করো…",
  className,
  size = "default",
}: {
  products: ProductLite[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => products.find((p) => p.id === value) ?? null, [products, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between gap-2 px-2 font-normal",
            size === "sm" ? "h-8 text-[11px]" : "h-9 text-xs",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.image ? (
              <img
                src={selected.image}
                alt=""
                loading="lazy"
                className="h-5 w-5 shrink-0 rounded object-cover"
              />
            ) : (
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.title : placeholder}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {selected && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(380px,90vw)] p-0" align="start">
        <Command
          filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Product / SKU খুঁজো…" className="h-9 text-xs" />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
              কোনো product পাওয়া যায়নি
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__ no product" onSelect={() => { onChange(null); setOpen(false); }}>
                <X className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs">No product</span>
              </CommandItem>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.title} ${p.sku ?? ""} ${p.id}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  {p.image ? (
                    <img src={p.image} alt="" loading="lazy" className="h-7 w-7 rounded object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-muted">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{p.title}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {p.sku ?? "no sku"} · stock {p.stock}
                    </span>
                  </span>
                  {value === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
