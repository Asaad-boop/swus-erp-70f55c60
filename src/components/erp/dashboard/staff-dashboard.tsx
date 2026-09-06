import { EmployeeDashboard } from "@/components/erp/dashboard/employee-dashboard";

/**
 * STAFF DASHBOARD — "My Work".
 * Everyone who is not owner/admin (including custom page-grant users).
 * Contains zero finance / profit / cash / payroll queries by construction:
 * it only reads attendance, its own task queues and the nav catalog.
 */
export function StaffDashboard({ actions }: { actions?: React.ReactNode }) {
  return (
    <div>
      {actions ? (
        <div className="flex justify-end px-4 md:px-6 pt-3 max-w-[1600px] mx-auto">{actions}</div>
      ) : null}
      <EmployeeDashboard />
    </div>
  );
}
