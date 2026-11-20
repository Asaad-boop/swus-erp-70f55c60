import { describe, expect, it, vi, beforeEach } from "vitest";
import { processInboxWebhook } from "./webhook.ts";
import { findBdPhone, fillTemplate } from "../../../src/lib/erp/inbox/inbox";

const CHANNELS: Record<string, any> = {
  "messenger:111": {
    id: "ch-m",
    brand_id: "b1",
    platform: "messenger",
    external_id: "111",
    page_id: "111",
    is_active: true,
  },
  "instagram:222": {
    id: "ch-i",
    brand_id: "b1",
    platform: "instagram",
    external_id: "222",
    page_id: "111",
    is_active: true,
  },
  "whatsapp:333": {
    id: "ch-w",
    brand_id: "b2",
    platform: "whatsapp",
    external_id: "333",
    page_id: null,
    is_active: true,
  },
};

function fakeAdmin() {
  const rpc = vi.fn(async () => ({ data: "msg-id", error: null }));
  const updates: any[] = [];
  const upserts: any[] = [];
  const from = (table: string) => {
    const filters: Record<string, any> = {};
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => {
        filters[k] = v;
        return q;
      },
      in: () => q,
      lte: () => q,
      is: () => q,
      upsert: (row: any) => {
        upserts.push({ table, row });
        return q;
      },
      single: async () => ({
        data: { id: table === "inbox_posts" ? "post-row" : "row" },
        error: null,
      }),
      update: (patch: any) => {
        updates.push({ table, patch, filters });
        return q;
      },
      maybeSingle: async () => {
        if (table === "inbox_channels")
          return { data: CHANNELS[`${filters.platform}:${filters.external_id}`] ?? null };
        if (table === "inbox_conversations")
          return { data: { id: "conv-1", contact_name: "Known" } };
        if (table === "inbox_channel_secrets") return { data: { access_token: "tok" } };
        return { data: null };
      },
      then: (r: any) => r({ data: null, error: null }),
    };
    return q;
  };
  return {
    rpc,
    from,
    updates,
    upserts,
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://cdn/x.jpg" } }),
      }),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("x", { status: 404 })),
  );
});

describe("processInboxWebhook", () => {
  it("ingests a Messenger text as inbound", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "page",
      entry: [
        {
          id: "111",
          messaging: [
            {
              sender: { id: "u1" },
              recipient: { id: "111" },
              timestamp: 1700000000000,
              message: { mid: "m1", text: "dam koto?" },
            },
          ],
        },
      ],
    });
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    const args = (admin.rpc.mock.calls[0] as any)[1];
    expect(args).toMatchObject({
      _channel_id: "ch-m",
      _external_user_id: "u1",
      _direction: "in",
      _external_message_id: "m1",
      _body: "dam koto?",
      _msg_type: "text",
    });
  });

  it("skips echoes of our own app but records echoes sent from the Meta inbox", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(
      admin,
      {
        object: "page",
        entry: [
          {
            id: "111",
            messaging: [
              {
                sender: { id: "111" },
                recipient: { id: "u1" },
                timestamp: 1,
                message: { mid: "e1", text: "ours", is_echo: true, app_id: 999 },
              },
              {
                sender: { id: "111" },
                recipient: { id: "u1" },
                timestamp: 2,
                message: { mid: "e2", text: "from phone", is_echo: true, app_id: 123 },
              },
            ],
          },
        ],
      },
      "999",
    );
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect((admin.rpc.mock.calls[0] as any)[1]).toMatchObject({
      _direction: "out",
      _external_user_id: "u1",
      _sent_via: "platform",
      _body: "from phone",
    });
  });

  it("maps Instagram image attachments", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "instagram",
      entry: [
        {
          id: "222",
          messaging: [
            {
              sender: { id: "ig1" },
              recipient: { id: "222" },
              timestamp: 1,
              message: {
                mid: "i1",
                attachments: [{ type: "image", payload: { url: "https://lookaside/img" } }],
              },
            },
          ],
        },
      ],
    });
    const args = (admin.rpc.mock.calls[0] as any)[1];
    expect(args._channel_id).toBe("ch-i");
    expect(args._msg_type).toBe("image");
    expect(args._attachments[0]).toMatchObject({ type: "image", url: "https://lookaside/img" });
  });

  it("ingests WhatsApp text with contact name + local phone, and applies statuses", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "333" },
                contacts: [{ wa_id: "8801711000000", profile: { name: "Rahim" } }],
                messages: [
                  {
                    from: "8801711000000",
                    id: "wamid.1",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "order korte chai" },
                  },
                ],
                statuses: [{ id: "wamid.0", status: "read" }],
              },
            },
          ],
        },
      ],
    });
    expect((admin.rpc.mock.calls[0] as any)[1]).toMatchObject({
      _channel_id: "ch-w",
      _external_user_id: "8801711000000",
      _contact_name: "Rahim",
      _contact_phone: "01711000000",
      _body: "order korte chai",
    });
    expect(
      admin.updates.some((u) => u.table === "inbox_messages" && u.patch.status === "read"),
    ).toBe(true);
  });

  it("ignores events for unknown channels", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "page",
      entry: [
        { id: "000", messaging: [{ sender: { id: "u" }, message: { mid: "x", text: "hi" } }] },
      ],
    });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe("comments", () => {
  it("stores a Facebook page comment as open and links the post", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "page",
      entry: [
        {
          id: "111",
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "111_c1",
                post_id: "111_p1",
                parent_id: "111_p1",
                from: { id: "u9", name: "Rahim" },
                message: "dam koto?",
                created_time: 1700000000,
              },
            },
          ],
        },
      ],
    });
    const c = admin.upserts.find((u: any) => u.table === "inbox_comments")!.row;
    expect(c).toMatchObject({
      platform: "facebook",
      external_comment_id: "111_c1",
      external_parent_id: null,
      author_name: "Rahim",
      is_from_page: false,
      status: "open",
      post_id: "post-row",
    });
  });

  it("marks the parent replied when the page itself replies", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "page",
      entry: [
        {
          id: "111",
          changes: [
            {
              field: "feed",
              value: {
                item: "comment",
                verb: "add",
                comment_id: "111_c2",
                post_id: "111_p1",
                parent_id: "111_c1",
                from: { id: "111", name: "Toyora" },
                message: "inbox check korun",
                created_time: 1700000001,
              },
            },
          ],
        },
      ],
    });
    const c = admin.upserts.find((u: any) => u.table === "inbox_comments")!.row;
    expect(c).toMatchObject({ is_from_page: true, status: "done", external_parent_id: "111_c1" });
    expect(
      admin.updates.some((u: any) => u.table === "inbox_comments" && u.patch.status === "done"),
    ).toBe(true);
  });

  it("stores an Instagram comment", async () => {
    const admin = fakeAdmin();
    await processInboxWebhook(admin, {
      object: "instagram",
      entry: [
        {
          id: "222",
          changes: [
            {
              field: "comments",
              value: {
                id: "ig_c1",
                text: "price?",
                from: { id: "ig9", username: "karim" },
                media: { id: "m1" },
              },
            },
          ],
        },
      ],
    });
    const c = admin.upserts.find((u: any) => u.table === "inbox_comments")!.row;
    expect(c).toMatchObject({
      platform: "instagram",
      external_comment_id: "ig_c1",
      author_username: "karim",
      is_from_page: false,
    });
  });
});

describe("helpers", () => {
  it("finds BD phone numbers incl. Bangla digits and +88", () => {
    expect(findBdPhone("amar number 01712-345678")).toBe("01712345678");
    expect(findBdPhone("+8801812345678 e call den")).toBe("01812345678");
    expect(findBdPhone("০১৯১২৩৪৫৬৭৮")).toBe("01912345678");
    expect(findBdPhone("no number here 12345")).toBeNull();
  });
  it("fills {name}", () => {
    const c: any = {
      contact_name: "Karim Uddin",
      contact_username: null,
      contact_phone: null,
      external_user_id: "1",
    };
    expect(fillTemplate("Hi {name}, thanks", c)).toBe("Hi Karim, thanks");
    expect(fillTemplate("Hi {name}, thanks", { ...c, contact_name: null })).toBe("Hi, thanks");
  });
});
