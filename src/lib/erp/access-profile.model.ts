import { z } from "zod";

export const APP_ROLES = [
  "admin",
  "operations",
  "accountant",
  "warehouse_staff",
  "packer",
  "customer_service",
  "marketing_manager",
  "cargo_agent",
  "hr_admin",
  "hr_manager",
  "employee",
  "moderator",
  "customer",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type PageMode = "role_default" | "custom";
export type BrandMode = "all" | "selected";

export const ROLE_REGISTRY: Record<AppRole, { label: string; description: string }> = {
  admin: { label: "Administrator", description: "Full system access and access management" },
  operations: {
    label: "Operations",
    description: "Orders, inventory, fulfillment and supply chain",
  },
  accountant: { label: "Accountant", description: "Finance, reports and reconciliation" },
  warehouse_staff: {
    label: "Warehouse staff",
    description: "Inventory, stocktake and fulfillment",
  },
  packer: { label: "Packer", description: "Packing, dispatch and labels" },
  customer_service: { label: "Customer service", description: "Orders, customers and follow-up" },
  marketing_manager: { label: "Marketing manager", description: "Growth, campaigns and analytics" },
  cargo_agent: { label: "Cargo agent", description: "Imports and cargo workflow" },
  hr_admin: { label: "HR administrator", description: "Full HRM operations" },
  hr_manager: { label: "HR manager", description: "Employees, attendance and performance" },
  employee: { label: "Employee", description: "Personal attendance self-service" },
  moderator: { label: "Moderator", description: "Limited dashboard access" },
  customer: { label: "Customer", description: "Storefront only; not a staff role" },
};

export type MyAccessProfile = {
  userId: string;
  roles: AppRole[];
  pageMode: PageMode;
  allowedPages: string[];
  brandMode: BrandMode;
  brandIds: string[];
  accessVersion: number;
  updatedAt: string | null;
};

export type AccessWorkspaceUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  roles: AppRole[];
  pageMode: PageMode;
  allowedPages: string[];
  brandMode: BrandMode;
  brandIds: string[];
  employeeId: string | null;
  employeeName: string | null;
  employeeCode: string | null;
  employeeStatus: string | null;
  updatedAt: string | null;
};

const roleEnum = z.enum(APP_ROLES);

export const replaceAccessProfileSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(roleEnum).min(1).max(10),
  brandMode: z.enum(["all", "selected"]),
  brandIds: z.array(z.string().uuid()).max(50),
  pageMode: z.enum(["role_default", "custom"]),
  allowedPages: z.array(z.string()).max(250),
  employeeId: z.string().uuid().nullable(),
});

export const createAccessUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  displayName: z.string().trim().min(1).max(100),
  roles: z.array(roleEnum).min(1).max(10),
  brandMode: z.enum(["all", "selected"]),
  brandIds: z.array(z.string().uuid()).max(50),
  pageMode: z.enum(["role_default", "custom"]),
  allowedPages: z.array(z.string()).max(250),
  employeeId: z.string().uuid().nullable(),
});

export const userIdSchema = z.object({ userId: z.string().uuid() });
export const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(72),
});
export const banSchema = z.object({ userId: z.string().uuid(), ban: z.boolean() });
export const authLinkSchema = z.object({
  email: z.string().email(),
  type: z.enum(["recovery", "magiclink"]),
});
