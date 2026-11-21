export const APP_ROLES = [
  "owner",
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
  owner: { label: "Owner", description: "Business owner — full access plus the owner dashboard" },
  admin: { label: "Administrator", description: "Full system access and access management" },
  operations: {
    label: "Operations",
    description: "Orders, inventory, fulfillment and supply chain",
  },
  accountant: { label: "Accountant", description: "Finance pages" },
  warehouse_staff: {
    label: "Warehouse staff",
    description: "Products, stock, stocktake and packing",
  },
  packer: {
    label: "Packer",
    description: "Packing Station only — scan orders to packing → packed → ready to ship",
  },
  customer_service: { label: "Customer service", description: "Orders, customers and follow-up" },
  marketing_manager: { label: "Marketing manager", description: "Growth, campaigns and analytics" },
  cargo_agent: { label: "Cargo agent", description: "Imports and cargo workflow" },
  hr_admin: {
    label: "HR administrator",
    description: "Reserved for the new HRM module (dashboard only for now)",
  },
  hr_manager: {
    label: "HR manager",
    description: "Reserved for the new HRM module (dashboard only for now)",
  },
  employee: {
    label: "Employee",
    description: "Basic staff login — dashboard plus any granted pages",
  },
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
  updatedAt: string | null;
};
