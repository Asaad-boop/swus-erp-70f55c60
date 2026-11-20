import { useState } from "react";
import { Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const GROUPS: Array<{ label: string; emojis: string }> = [
  { label: "Common", emojis: "🙏 ❤️ 😊 👍 ✅ 🎁 🔥 💯 🥰 😍 🤩 🙂 😄 😁 🤗 😇 👌 🤝 💐 🌸" },
  { label: "Shop", emojis: "💰 💵 🛒 🛍️ 📦 🚚 🏷️ 🎉 🎊 ⭐ 🌟 ✨ ⚡ 💥 🆕 🔖 📞 📲 💳 🧾" },
  { label: "Info", emojis: "📍 🏠 ⏰ 📅 ℹ️ ⚠️ ❗ ❓ ✔️ ❌ ➡️ ⬇️ 👉 👇 📌 🔔 📝 📷 🎥 🔗" },
  { label: "Kids", emojis: "🧸 🎈 🚗 🚀 🦄 🐻 🐼 🐰 🦁 🧩 🎨 📚 🎮 🪀 🍭 🍼 👶 🧒 👧 👦" },
  { label: "Feel", emojis: "😅 😂 🤣 😉 😌 🤔 😮 😢 😭 😔 😴 🙄 😎 🥳 🤭 🫶 💖 💕 💙 💚" },
];

/** Small curated emoji picker — inserts at the composer cursor. */
export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Emoji"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ib-ink-2,currentColor)] transition-colors hover:bg-[var(--ib-hover,var(--muted))] hover:text-[var(--ib-ink,currentColor)]"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-2">
        <div className="mb-1.5 flex gap-1">
          {GROUPS.map((g, i) => (
            <button
              key={g.label}
              type="button"
              onClick={() => setTab(i)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px]",
                tab === i
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {GROUPS[tab]!.emojis.split(" ").map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="flex h-7 w-7 items-center justify-center rounded text-lg hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
