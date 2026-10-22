/** Check roles through the caller's authenticated client, never browser storage. */
export async function assertIntegrationAdmin(
  supabase: { rpc: (name: "has_role", args: { _user_id: string; _role: "admin" | "owner" }) => PromiseLike<{ data: unknown; error: unknown }> },
  userId: string,
) {
  const results = await Promise.all(
    (["admin", "owner"] as const).map((_role) => supabase.rpc("has_role", { _user_id: userId, _role })),
  );
  for (const result of results) if (result.error) throw result.error;
  if (!results.some((result) => result.data === true)) throw new Error("Admin or owner only");
}