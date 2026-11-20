import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  Phone,
  PlusCircle,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BrandBadge } from "@/components/erp/brand-badge";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  addNote,
  deleteNote,
  displayName,
  fetchMessages,
  fetchNotes,
  fetchOrdersByPhone,
  findBdPhone,
  PLATFORM_LABEL,
  updateConversation,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/erp/inbox/inbox";
import { agoLabel, ContactAvatar, PlatformChip } from "./shared";

export function ContactPanel({
  conversation: c,
  onClose,
}: {
  conversation: InboxConversation;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { userId, isAdmin } = useCurrentRole();
  const name = displayName(c);
  const [phone, setPhone] = useState(c.contact_phone ?? "");
  const [nameEdit, setNameEdit] = useState(c.contact_name ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPhone(c.contact_phone ?? "");
    setNameEdit(c.contact_name ?? "");
    setNote("");
  }, [c.id, c.contact_phone, c.contact_name]);

  // Messages are already cached by the thread; reuse them to spot a phone number.
  const msgs = qc.getQueryData<InboxMessage[]>(["inbox", "messages", c.id]);
  const msgsQ = useQuery({
    queryKey: ["inbox", "messages", c.id],
    queryFn: () => fetchMessages(c.id),
    enabled: !msgs,
  });
  const detectedPhone = useMemo(() => {
    const list = msgs ?? msgsQ.data ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.direction !== "in") continue;
      const p = findBdPhone(m.body);
      if (p) return p;
    }
    return null;
  }, [msgs, msgsQ.data]);

  const savedPhone = (c.contact_phone ?? "").replace(/\D/g, "").replace(/^88/, "");
  const ordersQ = useQuery({
    queryKey: ["inbox", "orders-by-phone", savedPhone],
    queryFn: () => fetchOrdersByPhone(savedPhone),
    enabled: savedPhone.length >= 11,
  });

  const notesQ = useQuery({ queryKey: ["inbox", "notes", c.id], queryFn: () => fetchNotes(c.id) });

  const saveContact = useMutation({
    mutationFn: (patch: { contact_phone?: string | null; contact_name?: string | null }) =>
      updateConversation(c.id, patch),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: () => addNote(c, note.trim(), userId!),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["inbox", "notes", c.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox", "notes", c.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const normalizedPhone = phone.replace(/\D/g, "").replace(/^88/, "");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <span className="text-sm font-semibold">Customer</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={64} />
          <div className="text-sm font-semibold">{name}</div>
          {c.contact_username && (
            <div className="text-xs text-muted-foreground">@{c.contact_username}</div>
          )}
          <div className="flex items-center gap-1.5">
            <PlatformChip platform={c.platform} />
            <BrandBadge brandId={c.brand_id} variant="compact" />
          </div>
          <div className="text-[11px] text-muted-foreground">
            First message {agoLabel(c.created_at)}
          </div>
        </div>

        {/* Contact fields */}
        <div className="space-y-2">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Name
          </label>
          <div className="flex gap-2">
            <Input
              value={nameEdit}
              onChange={(e) => setNameEdit(e.target.value)}
              placeholder="Customer name"
              className="h-8 text-sm"
            />
            {nameEdit.trim() !== (c.contact_name ?? "") && (
              <Button
                size="sm"
                className="h-8"
                onClick={() => saveContact.mutate({ contact_name: nameEdit.trim() || null })}
              >
                Save
              </Button>
            )}
          </div>
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Phone
          </label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              inputMode="tel"
              className="h-8 text-sm"
            />
            {normalizedPhone !== savedPhone && (
              <Button
                size="sm"
                className="h-8"
                disabled={normalizedPhone.length > 0 && normalizedPhone.length !== 11}
                onClick={() => saveContact.mutate({ contact_phone: normalizedPhone || null })}
              >
                Save
              </Button>
            )}
          </div>
          {detectedPhone && detectedPhone !== savedPhone && (
            <button
              type="button"
              onClick={() => {
                setPhone(detectedPhone);
                saveContact.mutate({ contact_phone: detectedPhone });
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5 text-left text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Chat e number paisi: <span className="font-mono font-semibold">{detectedPhone}</span>
              <span className="ml-auto text-primary">Save</span>
            </button>
          )}
          {savedPhone && (
            <a
              href={`tel:${savedPhone}`}
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              <Phone className="h-3 w-3" /> Call {savedPhone}
            </a>
          )}
        </div>

        <Button asChild className="w-full gap-2">
          <Link
            to="/erp/orders/new"
            search={{
              phone: savedPhone || detectedPhone || undefined,
              name: c.contact_name || undefined,
              brand: c.brand_id,
              source: PLATFORM_LABEL[c.platform],
            }}
          >
            <PlusCircle className="h-4 w-4" /> Create order
          </Link>
        </Button>

        {/* Orders */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Orders
          </div>
          {!savedPhone ? (
            <div className="text-xs text-muted-foreground">Phone save korle ager order dekhabe</div>
          ) : ordersQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (ordersQ.data ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Ei number e kono order nai — new customer
            </div>
          ) : (
            <ul className="space-y-1.5">
              {ordersQ.data!.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/erp/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted/50"
                  >
                    <span className="font-mono">
                      {o.invoice_no ?? o.id.slice(0, 8).toUpperCase()}
                    </span>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                      {o.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="ml-auto font-medium">
                      ৳{Math.round(Number(o.total ?? 0)).toLocaleString("en-BD")}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <StickyNote className="h-3 w-3" /> Internal notes
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) {
                e.preventDefault();
                add.mutate();
              }
            }}
            placeholder="Team er jonno note… (customer dekhbe na)"
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            disabled={!note.trim() || add.isPending || !userId}
            onClick={() => add.mutate()}
          >
            Add note
          </Button>
          <ul className="space-y-2">
            {(notesQ.data ?? []).map((n) => (
              <li key={n.id} className="group rounded-lg bg-amber-500/10 px-3 py-2 text-xs">
                <div className="whitespace-pre-wrap">{n.body}</div>
                <div className="mt-1 flex items-center text-[10px] text-muted-foreground">
                  {agoLabel(n.created_at)}
                  {(n.created_by === userId || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => del.mutate(n.id)}
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
