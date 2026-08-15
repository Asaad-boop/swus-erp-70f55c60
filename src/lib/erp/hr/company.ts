/** Company profile used on payslips / HR documents. Stored in app_settings under "hr_company". */
export type HrCompany = {
  name: string;
  legal_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  bin: string;
  logo_url: string;
  footer_note: string;
  signatory_name: string;
  signatory_title: string;
};

export const DEFAULT_HR_COMPANY: HrCompany = {
  name: "Synq With Us",
  legal_name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  bin: "",
  logo_url: "",
  footer_note: "This is a computer generated payslip and does not require a signature.",
  signatory_name: "",
  signatory_title: "Authorised Signatory",
};

export const mergeCompany = (v: unknown): HrCompany => ({
  ...DEFAULT_HR_COMPANY,
  ...((v as Partial<HrCompany>) ?? {}),
});
