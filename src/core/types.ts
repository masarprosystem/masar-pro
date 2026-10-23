export type OfficeRole = 'owner' | 'accountant' | 'operations' | 'hr';
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';
export type AppModule = 'recruitment' | 'payroll' | 'staff';
export type Seats = Partial<Record<OfficeRole, number>>;

export interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  seats: Seats;
  extra_seat_price: number | null;
  max_active_couriers: number | null;
  modules: AppModule[];
  is_active: boolean;
}

export interface Office {
  id: string;
  name: string;
  slug: string | null;
  phone: string | null;
  city: string | null;
  logo_path: string | null;
  created_at: string;
}

export interface Subscription {
  office_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  grace_days: number;
  monthly_price: number;
  extra_seats: Seats;
  max_active_couriers: number | null;
  modules: AppModule[];
  notes: string | null;
  updated_at: string;
}

export interface Member {
  id: string;
  office_id: string;
  user_id: string;
  role: OfficeRole;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Membership extends Member {
  office: Office & { subscription: Subscription | null };
}

export interface Payment {
  id: string;
  office_id: string;
  amount: number;
  method: string;
  reference: string | null;
  months: number;
  period_start: string;
  period_end: string;
  paid_at: string;
  notes: string | null;
}

export interface AuditRow {
  id: number;
  office_id: string | null;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface OfficeOverview {
  office_id: string;
  office_name: string;
  city: string | null;
  phone: string | null;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_end: string;
  days_left: number;
  monthly_price: number;
  modules: AppModule[];
  members_active: number;
  seats_total: number;
  owner_email: string | null;
  last_activity: string | null;
  created_at: string;
}
