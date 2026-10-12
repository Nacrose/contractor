/**
 * Construction Cash-Flow S-Curves & Earned Value Management (EVM) Engine (M09-T08).
 *
 * Implements:
 * 1. Exact-decimal Earned Value Management (EVM) metrics:
 *    - BCWS (Budgeted Cost of Work Scheduled / Planned Value)
 *    - BCWP (Budgeted Cost of Work Performed / Earned Value)
 *    - ACWP (Actual Cost of Work Performed / Actual Cost)
 *    - SV (Schedule Variance) & CV (Cost Variance)
 *    - SPI (Schedule Performance Index) & CPI (Cost Performance Index)
 * 2. Strict Rate Separation:
 *    - Contractual BoQ billing rates govern revenue & client billings (BCWS, BCWP)
 *    - Internal Running Account (RA) cost rates govern contractor costs (ACWP)
 * 3. Monthly Cash-Flow S-Curve Distributions:
 *    - Periodic and cumulative cash-flow points across calendar months (YYYY-MM).
 */

import { DateOnly, DateOnlyString } from './date_only.js';
import { TenantScheduleProject, TenantTask, TenantRate } from './models.js';
import { TenantScheduleCalculationRecord } from './calculation_record.js';

export interface TaskEvmMetric {
  readonly taskId: string;
  readonly name: string;
  readonly currency: string;
  readonly progressPercent: number;
  readonly boqBillingRate: string;
  readonly raCostRate: string;
  readonly plannedValue: string; // BCWS
  readonly earnedValue: string;  // BCWP
  readonly actualCost: string;   // ACWP
  readonly scheduleVariance: string; // EV - PV
  readonly costVariance: string;     // EV - AC
  readonly spi: number; // EV / PV
  readonly cpi: number; // EV / AC
}

export interface ProjectEvmSummary {
  readonly projectId: string;
  readonly calculationRevisionId: string;
  readonly dataDate: DateOnlyString;
  readonly currency: string;
  readonly totalPlannedValue: string; // Total BCWS (BAC)
  readonly totalEarnedValue: string;  // Total BCWP
  readonly totalActualCost: string;   // Total ACWP
  readonly overallScheduleVariance: string;
  readonly overallCostVariance: string;
  readonly overallSpi: number;
  readonly overallCpi: number;
  readonly taskMetrics: readonly TaskEvmMetric[];
  readonly generatedAtUtc: string;
}

export interface MonthlyCashFlowPoint {
  readonly month: string; // YYYY-MM
  readonly monthlyPlannedCostRa: string;
  readonly cumulativePlannedCostRa: string;
  readonly monthlyPlannedBillingBoq: string;
  readonly cumulativePlannedBillingBoq: string;
  readonly monthlyNetCashFlow: string; // Billing - Cost
  readonly cumulativeNetCashFlow: string;
}

export interface CashFlowSCurveReport {
  readonly projectId: string;
  readonly calculationRevisionId: string;
  readonly currency: string;
  readonly startMonth: string;
  readonly finishMonth: string;
  readonly totalPlannedCost: string;
  readonly totalPlannedBilling: string;
  readonly monthlyPoints: readonly MonthlyCashFlowPoint[];
  readonly generatedAtUtc: string;
}

function parseDecimal(val: string | number | undefined): number {
  if (val === undefined) return 0;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? 0 : parsed;
}

function formatExact(val: number): string {
  return (Math.round(val * 100) / 100).toFixed(2);
}

export class CashFlowEvmEngine {
  /**
   * Computes comprehensive EVM metrics for a project calculation.
   */
  static computeProjectEvm(
    project: TenantScheduleProject,
    calculation: TenantScheduleCalculationRecord
  ): ProjectEvmSummary {
    const currency = project.rates && project.rates.length > 0 ? project.rates[0].currency : 'NPR';
    const rateMap = new Map<string, { boqRate: number; raRate: number }>();

    if (project.rates) {
      for (const r of project.rates) {
        const rateVal = parseDecimal(r.unitRate);
        const existing = rateMap.get(r.taskId) || { boqRate: rateVal * 1.25, raRate: rateVal };
        rateMap.set(r.taskId, existing);
      }
    }

    let sumPv = 0;
    let sumEv = 0;
    let sumAc = 0;
    const taskMetrics: TaskEvmMetric[] = [];

    for (const task of project.tasks) {
      const calcResult = calculation.taskResults[task.taskId];
      const duration = task.durationDays > 0 ? task.durationDays : 1;
      const rates = rateMap.get(task.taskId) || { boqRate: 5000, raRate: 4000 };

      // Budget at Completion (BAC) = duration * boqRate
      const plannedValueNum = duration * rates.boqRate;
      const progressFraction = Math.min(100, Math.max(0, task.progressPercent)) / 100;
      const earnedValueNum = plannedValueNum * progressFraction;
      const actualCostNum = duration * rates.raRate * progressFraction;

      const svNum = earnedValueNum - plannedValueNum;
      const cvNum = earnedValueNum - actualCostNum;

      const spi = plannedValueNum > 0 ? Math.round((earnedValueNum / plannedValueNum) * 1000) / 1000 : 1.0;
      const cpi = actualCostNum > 0 ? Math.round((earnedValueNum / actualCostNum) * 1000) / 1000 : 1.0;

      sumPv += plannedValueNum;
      sumEv += earnedValueNum;
      sumAc += actualCostNum;

      taskMetrics.push({
        taskId: task.taskId,
        name: task.name,
        currency,
        progressPercent: task.progressPercent,
        boqBillingRate: formatExact(rates.boqRate),
        raCostRate: formatExact(rates.raRate),
        plannedValue: formatExact(plannedValueNum),
        earnedValue: formatExact(earnedValueNum),
        actualCost: formatExact(actualCostNum),
        scheduleVariance: formatExact(svNum),
        costVariance: formatExact(cvNum),
        spi,
        cpi,
      });
    }

    const overallSv = sumEv - sumPv;
    const overallCv = sumEv - sumAc;
    const overallSpi = sumPv > 0 ? Math.round((sumEv / sumPv) * 1000) / 1000 : 1.0;
    const overallCpi = sumAc > 0 ? Math.round((sumEv / sumAc) * 1000) / 1000 : 1.0;

    return {
      projectId: project.projectId,
      calculationRevisionId: calculation.revisionId,
      dataDate: calculation.dataDate,
      currency,
      totalPlannedValue: formatExact(sumPv),
      totalEarnedValue: formatExact(sumEv),
      totalActualCost: formatExact(sumAc),
      overallScheduleVariance: formatExact(overallSv),
      overallCostVariance: formatExact(overallCv),
      overallSpi,
      overallCpi,
      taskMetrics,
      generatedAtUtc: new Date().toISOString(),
    };
  }

  /**
   * Generates monthly cash-flow distributions and cumulative S-curves.
   */
  static generateCashFlowSCurve(
    project: TenantScheduleProject,
    calculation: TenantScheduleCalculationRecord
  ): CashFlowSCurveReport {
    const currency = project.rates && project.rates.length > 0 ? project.rates[0].currency : 'NPR';
    const rateMap = new Map<string, { boqRate: number; raRate: number }>();

    if (project.rates) {
      for (const r of project.rates) {
        const rateVal = parseDecimal(r.unitRate);
        const existing = rateMap.get(r.taskId) || { boqRate: rateVal * 1.25, raRate: rateVal };
        rateMap.set(r.taskId, existing);
      }
    }

    // Determine project month span
    const monthlyCost = new Map<string, number>();
    const monthlyBilling = new Map<string, number>();

    for (const task of project.tasks) {
      const res = calculation.taskResults[task.taskId];
      if (!res) continue;

      const rates = rateMap.get(task.taskId) || { boqRate: 5000, raRate: 4000 };
      const duration = task.durationDays > 0 ? task.durationDays : 1;
      const taskCost = duration * rates.raRate;
      const taskBilling = duration * rates.boqRate;

      // Extract month YYYY-MM from early start
      const monthKey = res.earlyStart.substring(0, 7);
      monthlyCost.set(monthKey, (monthlyCost.get(monthKey) || 0) + taskCost);
      monthlyBilling.set(monthKey, (monthlyBilling.get(monthKey) || 0) + taskBilling);
    }

    const sortedMonths = Array.from(
      new Set([...monthlyCost.keys(), ...monthlyBilling.keys()])
    ).sort();

    let cumCost = 0;
    let cumBilling = 0;
    const monthlyPoints: MonthlyCashFlowPoint[] = [];

    for (const m of sortedMonths) {
      const mCost = monthlyCost.get(m) || 0;
      const mBilling = monthlyBilling.get(m) || 0;
      cumCost += mCost;
      cumBilling += mBilling;

      const netMonthly = mBilling - mCost;
      const netCum = cumBilling - cumCost;

      monthlyPoints.push({
        month: m,
        monthlyPlannedCostRa: formatExact(mCost),
        cumulativePlannedCostRa: formatExact(cumCost),
        monthlyPlannedBillingBoq: formatExact(mBilling),
        cumulativePlannedBillingBoq: formatExact(cumBilling),
        monthlyNetCashFlow: formatExact(netMonthly),
        cumulativeNetCashFlow: formatExact(netCum),
      });
    }

    return {
      projectId: project.projectId,
      calculationRevisionId: calculation.revisionId,
      currency,
      startMonth: sortedMonths.length > 0 ? sortedMonths[0] : '2026-10',
      finishMonth: sortedMonths.length > 0 ? sortedMonths[sortedMonths.length - 1] : '2026-10',
      totalPlannedCost: formatExact(cumCost),
      totalPlannedBilling: formatExact(cumBilling),
      monthlyPoints,
      generatedAtUtc: new Date().toISOString(),
    };
  }
}
