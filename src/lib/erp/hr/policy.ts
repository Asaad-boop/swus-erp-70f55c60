/** Shared HR attendance/payroll policy shape stored in app_settings under "hr_policy". */
export type HrPolicy = {
  day_start: string;
  day_end: string;
  late_grace_min: number;
  half_day_hours: number;
  full_day_hours: number;
  week_offs: number[];
  monthly_working_days: number;
};

export const DEFAULT_HR_POLICY: HrPolicy = {
  day_start: "10:00",
  day_end: "19:00",
  late_grace_min: 15,
  half_day_hours: 4,
  full_day_hours: 8,
  week_offs: [5],
  monthly_working_days: 26,
};
