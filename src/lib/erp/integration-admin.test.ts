import { describe, expect, it } from "vitest";
import { assertIntegrationAdmin } from "./integration-admin";

describe("integration settings authorization", () => {
  const client = (roles: string[]) => ({ rpc: async (_name: "has_role", args: { _user_id: string; _role: "admin" | "owner" }) => ({ data: roles.includes(args._role), error: null }) });
  it("allows an owner without an admin role to save or clear the key", async () => {
    await expect(assertIntegrationAdmin(client(["owner"]), "owner-user")).resolves.toBeUndefined();
  });
  it("preserves admin access", async () => {
    await expect(assertIntegrationAdmin(client(["admin"]), "admin-user")).resolves.toBeUndefined();
  });
  it("rejects ordinary staff", async () => {
    await expect(assertIntegrationAdmin(client(["operations"]), "staff-user")).rejects.toThrow("Admin or owner only");
  });
  it("does not ignore a failed role lookup", async () => {
    const error = new Error("Role lookup failed");
    await expect(assertIntegrationAdmin({ rpc: async () => ({ data: true, error }) }, "user")).rejects.toThrow(error);
  });
});