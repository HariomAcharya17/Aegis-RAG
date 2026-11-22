export type Role = "employee" | "finance" | "hr" | "marketing" | "executive";
export type Department = "general" | "finance" | "hr" | "marketing";

export const ROLES: Role[] = ["employee", "finance", "hr", "marketing", "executive"];
export const RESTRICTED_DEPARTMENTS: Department[] = ["finance", "hr", "marketing"];

// Mirror of public.role_permissions, used for UI labels and eval leak checks.
// The database table is the source of truth for actual access.
export const ROLE_DEPARTMENTS: Record<Role, Department[]> = {
  employee: ["general"],
  finance: ["general", "finance"],
  hr: ["general", "hr"],
  marketing: ["general", "marketing"],
  executive: ["general", "finance", "hr", "marketing"],
};

export const ROLE_LABEL: Record<Role, string> = {
  employee: "Employee",
  finance: "Finance",
  hr: "People (HR)",
  marketing: "Marketing",
  executive: "Executive",
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  general: "General",
  finance: "Finance",
  hr: "HR",
  marketing: "Marketing",
};

// Roles allowed to see personal data (emails, phone numbers) in answers.
export const PII_ROLES: Role[] = ["hr", "executive"];

export const DEMO_DOMAIN = "kestrel.example.com";

export const DEMO_USERS: { role: Role; email: string; name: string; blurb: string }[] = [
  { role: "employee", email: `employee@${DEMO_DOMAIN}`, name: "Sam Rivera", blurb: "Handbook and policies only" },
  { role: "finance", email: `finance@${DEMO_DOMAIN}`, name: "Priya Nair", blurb: "Adds revenue, profit, budgets" },
  { role: "hr", email: `hr@${DEMO_DOMAIN}`, name: "Jordan Lee", blurb: "Adds headcount, payroll, attrition" },
  { role: "marketing", email: `marketing@${DEMO_DOMAIN}`, name: "Mateo Cruz", blurb: "Adds campaigns and spend" },
  { role: "executive", email: `executive@${DEMO_DOMAIN}`, name: "Elena Park", blurb: "Everything, plus the admin console" },
];

export const SUGGESTIONS: Record<Role, string[]> = {
  employee: [
    "How many PTO days do I get?",
    "What is the remote work policy?",
    "What is the daily meal limit when travelling?",
  ],
  finance: [
    "What was total profit in 2025?",
    "Which region had the highest revenue in 2024?",
    "Which sub-categories lost money last year?",
  ],
  hr: [
    "What is the attrition rate in Sales?",
    "How does overtime relate to attrition?",
    "What is the salary band for a level 2 Sales Executive?",
  ],
  marketing: [
    "Which campaign had the best acceptance rate?",
    "What did the Holiday Tech Deals campaign cost per acceptance?",
    "Which customer segment responds best to campaigns?",
  ],
  executive: [
    "Summarise 2025 profit by region.",
    "Which department has the highest attrition?",
    "What is planned for marketing in FY2026?",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}
