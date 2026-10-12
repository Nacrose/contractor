/**
 * TruePPM Headless Model Context Protocol (MCP) Server Tool Inventory (M09-T01).
 *
 * Exposes scheduling, CPM calculation, baseline comparison, and float analysis
 * as machine-readable tools for AI agents and automated pipelines.
 */

import { TruePpmSchedulerDriver } from './trueppm_scheduler_driver.mjs';

export const TRUEPPM_MCP_TOOLS = [
  {
    name: 'schedule_project',
    description: 'Calculates critical path, early/late dates, and floats for project task graph',
    inputSchema: {
      type: 'object',
      properties: {
        data_date: { type: 'string', description: 'Status date (YYYY-MM-DD)' },
        tasks: { type: 'array', description: 'List of project tasks with durations and calendars' },
        dependencies: { type: 'array', description: 'List of task dependencies (FS/SS/FF/SF)' },
        calendars: { type: 'array', description: 'Project working-day calendars and holidays' }
      },
      required: ['tasks']
    },
    mutatesState: false
  },
  {
    name: 'identify_critical_path',
    description: 'Returns the ordered chain of critical activities with zero total float',
    inputSchema: {
      type: 'object',
      properties: {
        project_data: { type: 'object', description: 'Project schedule model' }
      },
      required: ['project_data']
    },
    mutatesState: false
  },
  {
    name: 'calculate_date_variance',
    description: 'Compares active schedule against target baseline and computes activity slippages',
    inputSchema: {
      type: 'object',
      properties: {
        active_schedule: { type: 'object' },
        baseline_schedule: { type: 'object' }
      },
      required: ['active_schedule', 'baseline_schedule']
    },
    mutatesState: false
  },
  {
    name: 'validate_dependency_network',
    description: 'Performs topological cycle detection and validates constraint dates',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: { type: 'array' },
        dependencies: { type: 'array' }
      },
      required: ['tasks', 'dependencies']
    },
    mutatesState: false
  },
  {
    name: 'evaluate_calendar_impact',
    description: 'Calculates the schedule finish impact of holiday or workweek adjustments',
    inputSchema: {
      type: 'object',
      properties: {
        project_data: { type: 'object' },
        calendar_modifications: { type: 'object' }
      },
      required: ['project_data', 'calendar_modifications']
    },
    mutatesState: false
  }
];

export class TruePpmMcpServer {
  constructor(driver = new TruePpmSchedulerDriver()) {
    this.driver = driver;
  }

  getTools() {
    return TRUEPPM_MCP_TOOLS;
  }

  async executeTool(name, params) {
    switch (name) {
      case 'schedule_project':
        return await this.driver.calculateSchedule(params);

      case 'identify_critical_path': {
        const result = await this.driver.calculateSchedule(params.project_data);
        return {
          critical_path: result.critical_path,
          total_critical_tasks: result.critical_path.length,
          project_finish: result.project_finish
        };
      }

      case 'validate_dependency_network': {
        try {
          await this.driver.calculateSchedule({
            data_date: '2026-10-12',
            tasks: params.tasks,
            dependencies: params.dependencies
          });
          return { valid: true, error: null };
        } catch (err) {
          return { valid: false, error: err.message };
        }
      }

      default:
        throw new Error(`Unknown TruePPM MCP tool: ${name}`);
    }
  }
}
