import type { ToolDef } from "@/lib/groq";
import type { Db } from "@/lib/supabase/server";

// Typed tools instead of free-form text-to-SQL. The model picks a tool and
// arguments; the server runs a fixed query through the USER'S client, so
// RLS on employees / finance_quarterly / marketing_campaigns still applies.
// The model cannot write SQL, so it cannot write a query that escapes RLS.

type ToolSpec = { department: string; def: ToolDef };

const TOOLS: ToolSpec[] = [
  {
    department: "hr",
    def: {
      type: "function",
      function: {
        name: "employee_stats",
        description:
          "The authoritative source for workforce numbers. Use it for ANY question about how many people/employees work somewhere, average pay, attrition or overtime rates, or tenure. Returns headcount, average monthly income, attrition rate, overtime rate and average tenure, grouped by department, job_role, job_level or gender.",
        parameters: {
          type: "object",
          properties: {
            group_by: { type: "string", enum: ["department", "job_role", "job_level", "gender"] },
          },
          required: ["group_by"],
        },
      },
    },
  },
  {
    department: "hr",
    def: {
      type: "function",
      function: {
        name: "find_employee",
        description: "Look up individual employee records (role, level, salary, tenure, contact) by full or partial name.",
        parameters: {
          type: "object",
          properties: { name: { type: "string", description: "Full or partial employee name" } },
          required: ["name"],
        },
      },
    },
  },
  {
    department: "finance",
    def: {
      type: "function",
      function: {
        name: "finance_summary",
        description:
          "The authoritative source for finance numbers: revenue, profit, margin and order count from the ledger (years 2022-2025). Use it for any total, comparison or breakdown. Optional filters; results grouped by one dimension.",
        parameters: {
          type: "object",
          properties: {
            year: { type: "integer", description: "2022 to 2025" },
            quarter: { type: "integer", description: "1 to 4" },
            region: { type: "string", enum: ["Central", "East", "South", "West"] },
            category: { type: "string", enum: ["Furniture", "Office Supplies", "Technology"] },
            group_by: { type: "string", enum: ["region", "category", "year", "quarter"] },
          },
          required: ["group_by"],
        },
      },
    },
  },
  {
    department: "marketing",
    def: {
      type: "function",
      function: {
        name: "campaign_performance",
        description: "Marketing campaign results: channel, budget, customers targeted, acceptances, acceptance rate, cost per acceptance.",
        parameters: {
          type: "object",
          properties: { campaign: { type: "string", description: "Optional campaign name filter" } },
        },
      },
    },
  },
];

export function toolsFor(departments: string[]): ToolDef[] {
  return TOOLS.filter((t) => departments.includes(t.department)).map((t) => t.def);
}

export const TOOL_DEPARTMENT: Record<string, string> = Object.fromEntries(
  TOOLS.map((t) => [t.def.function.name, t.department]),
);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`).slice(0, 80);

export async function runTool(db: Db, name: string, rawArgs: string): Promise<{ result: unknown; rows: number }> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { result: { error: "Arguments were not valid JSON" }, rows: 0 };
  }
  const str = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : null);
  const int = (k: string) => (Number.isInteger(args[k]) ? (args[k] as number) : null);

  switch (name) {
    case "employee_stats": {
      const { data, error } = await db.rpc("employee_stats", { group_by: str("group_by") ?? "department" });
      if (error) return { result: { error: error.message }, rows: 0 };
      return { result: data, rows: data?.length ?? 0 };
    }
    case "find_employee": {
      const q = str("name");
      if (!q) return { result: { error: "name is required" }, rows: 0 };
      const { data, error } = await db
        .from("employees")
        .select("employee_id, full_name, email, phone, department, job_role, job_level, monthly_income, years_at_company, performance_rating, overtime, hire_date")
        .ilike("full_name", `%${escapeLike(q)}%`)
        .limit(5);
      if (error) return { result: { error: error.message }, rows: 0 };
      return { result: data, rows: data?.length ?? 0 };
    }
    case "finance_summary": {
      const { data, error } = await db.rpc("finance_summary", {
        p_year: int("year"),
        p_quarter: int("quarter"),
        p_region: str("region"),
        p_category: str("category"),
        group_by: str("group_by") ?? "region",
      });
      if (error) return { result: { error: error.message }, rows: 0 };
      return { result: data, rows: data?.length ?? 0 };
    }
    case "campaign_performance": {
      let query = db.from("marketing_campaigns").select("*").order("quarter");
      const c = str("campaign");
      if (c) query = query.ilike("campaign", `%${escapeLike(c)}%`);
      const { data, error } = await query;
      if (error) return { result: { error: error.message }, rows: 0 };
      return { result: data, rows: data?.length ?? 0 };
    }
    default:
      return { result: { error: `Unknown tool ${name}` }, rows: 0 };
  }
}
