export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  data: T[] | null;
  error: string | null;
  meta: {
    total: number;
    page: number;
    page_size: number;
  };
}

export type ModuleKey = "risk" | "incident";

export type PlanStage = "TRIAL" | "PAID" | "EXPIRED";

export type UserRole = "Owner" | "Manager" | "Analyst";

export interface Permissions {
  manage_risks: boolean;
  manage_incidents: boolean;
  review_resolve: boolean;
  generate_ai: boolean;
  print_reports: boolean;
  manage_users: boolean;
  manage_settings: boolean;
}
