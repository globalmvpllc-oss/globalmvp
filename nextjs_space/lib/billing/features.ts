import type { Plan } from './plans';
import type { TranslationKey } from '@/lib/i18n';

/**
 * What each plan allows, and what the application can actually deliver.
 *
 * Two separate ideas live here and it matters that they stay separate:
 *
 *   - LIMITS are enforced server-side in the API routes. They are real.
 *   - CAPABILITIES describe features. Each carries a `status`, because a plan
 *     may name something the product does not build yet.
 *
 * A capability marked `planned` is never presented as included. Showing it as
 * available would be selling something no code delivers, and a customer who
 * upgraded for it would find nothing there.
 */

/** `null` means no limit. */
export interface PlanLimits {
  customers: number | null;
  invoicesPerMonth: number | null;
  incomePerMonth: number | null;
  expensesPerMonth: number | null;
  invoicePdfPerMonth: number | null;
  teamMembers: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    customers: 50,
    invoicesPerMonth: 20,
    incomePerMonth: 100,
    expensesPerMonth: 100,
    invoicePdfPerMonth: 20,
    teamMembers: 1,
  },
  pro: {
    customers: 500,
    invoicesPerMonth: 500,
    incomePerMonth: 1000,
    expensesPerMonth: 1000,
    invoicePdfPerMonth: 500,
    teamMembers: 1,
  },
  business: {
    customers: null,
    invoicesPerMonth: null,
    incomePerMonth: null,
    expensesPerMonth: null,
    invoicePdfPerMonth: null,
    // Capped, but see TEAM_MEMBERS_NOTE below: nothing can add a second member
    // yet, so this ceiling is not reachable.
    teamMembers: 5,
  },
};

/** The countable resources a limit applies to. */
export type LimitedResource =
  | 'customers'
  | 'invoicesPerMonth'
  | 'incomePerMonth'
  | 'expensesPerMonth'
  | 'invoicePdfPerMonth';

export function limitFor(plan: Plan, resource: LimitedResource): number | null {
  return PLAN_LIMITS[plan][resource];
}

/**
 * Whether a plan is at or past its allowance for a resource.
 *
 * `current` is the count already stored. Unlimited plans always pass.
 */
export function isOverLimit(plan: Plan, resource: LimitedResource, current: number): boolean {
  const limit = limitFor(plan, resource);
  return limit !== null && current >= limit;
}

/**
 * There is no invitation flow, so a company always has exactly its owner.
 * The ceiling above is therefore inert; the billing page says so rather than
 * advertising team management as something a reader can use today.
 */
export const TEAM_MEMBERS_NOTE = 'no-invitation-flow';

/**
 * `available` — implemented and enforced today.
 * `planned`  — named by the plan, not built yet. Never shown as included.
 */
export type CapabilityStatus = 'available' | 'planned';

export interface Capability {
  id: string;
  labelKey: TranslationKey;
  /** Minimum plan. */
  requires: Plan;
  status: CapabilityStatus;
}

export const CAPABILITIES: readonly Capability[] = [
  // Shipped, and available on every plan — subject to the limits above.
  { id: 'dashboard', labelKey: 'feature.dashboard', requires: 'free', status: 'available' },
  { id: 'customers', labelKey: 'feature.customers', requires: 'free', status: 'available' },
  { id: 'invoices', labelKey: 'feature.invoices', requires: 'free', status: 'available' },
  { id: 'invoicePdf', labelKey: 'feature.invoicePdf', requires: 'free', status: 'available' },
  { id: 'income', labelKey: 'feature.income', requires: 'free', status: 'available' },
  { id: 'expenses', labelKey: 'feature.expenses', requires: 'free', status: 'available' },
  { id: 'payments', labelKey: 'feature.payments', requires: 'free', status: 'available' },
  { id: 'calendar', labelKey: 'feature.calendar', requires: 'free', status: 'available' },
  { id: 'reports', labelKey: 'feature.reports', requires: 'free', status: 'available' },
  { id: 'branding', labelKey: 'feature.branding', requires: 'free', status: 'available' },
  { id: 'currencies', labelKey: 'feature.currencies', requires: 'free', status: 'available' },
  { id: 'billing', labelKey: 'feature.billing', requires: 'free', status: 'available' },

  // Named by the paid plans, not built. The gate exists so that the day these
  // ship they are already restricted; until then they render as "planned".
  { id: 'advancedReports', labelKey: 'feature.advancedReports', requires: 'pro', status: 'planned' },
  { id: 'dataExport', labelKey: 'feature.dataExport', requires: 'pro', status: 'planned' },
  { id: 'bulkExport', labelKey: 'feature.bulkExport', requires: 'pro', status: 'planned' },
  { id: 'teamMembers', labelKey: 'feature.teamMembers', requires: 'business', status: 'planned' },
  { id: 'businessControls', labelKey: 'feature.businessControls', requires: 'business', status: 'planned' },
  { id: 'prioritySupport', labelKey: 'feature.prioritySupport', requires: 'business', status: 'planned' },
] as const;

const RANK: Record<Plan, number> = { free: 0, pro: 1, business: 2 };

export function planMeets(plan: Plan, required: Plan): boolean {
  return RANK[plan] >= RANK[required];
}

/** Whether a plan reaches a capability's tier — ignores whether it is built. */
export function planIncludes(plan: Plan, capability: Capability): boolean {
  return planMeets(plan, capability.requires);
}

/** Included AND shipped: what a reader can actually use today. */
export function planDelivers(plan: Plan, capability: Capability): boolean {
  return capability.status === 'available' && planIncludes(plan, capability);
}

export function availableCapabilities(plan: Plan): readonly Capability[] {
  return CAPABILITIES.filter((capability) => planDelivers(plan, capability));
}

export function plannedCapabilities(plan: Plan): readonly Capability[] {
  return CAPABILITIES.filter(
    (capability) => capability.status === 'planned' && planIncludes(plan, capability)
  );
}
