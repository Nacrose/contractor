/**
 * TruePPM Scheduler Subprocess Driver (M09-T01).
 *
 * Interfaces with the pinned TruePPM Python scheduler engine via stdio JSON protocol.
 * Measures execution latency, validates schemas, and handles error reporting.
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(__dirname, 'trueppm_engine.py');

export class TruePpmSchedulerDriver {
  constructor(pythonBin = 'python3', engineScript = ENGINE_PATH) {
    this.pythonBin = pythonBin;
    this.engineScript = engineScript;
  }

  async getVersion() {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonBin, [this.engineScript, '--version']);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`Failed to get TruePPM version: ${stderr}`));
      });
    });
  }

  async calculateSchedule(projectData) {
    const startTime = performance.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonBin, [this.engineScript]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      proc.on('close', code => {
        const durationMs = performance.now() - startTime;

        if (code !== 0) {
          try {
            const errJson = JSON.parse(stderr);
            return reject(new Error(`TruePPM Error [${errJson.error_type}]: ${errJson.message}`));
          } catch {
            return reject(new Error(`TruePPM Process Exited with code ${code}: ${stderr || stdout}`));
          }
        }

        try {
          const parsed = JSON.parse(stdout);
          parsed.execution_duration_ms = durationMs;
          resolve(parsed);
        } catch (parseErr) {
          reject(new Error(`Failed to parse TruePPM JSON output: ${parseErr.message}\nRaw: ${stdout}`));
        }
      });

      proc.stdin.write(JSON.stringify(projectData));
      proc.stdin.end();
    });
  }
}
