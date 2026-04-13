/**
 * spreadsheetExport.ts
 *
 * Build and download a CSV export of the current route for use in
 * Google Sheets / Excel.
 *
 * Output columns:
 *   Order | Name | Task | Requirements | Pts | Notes
 *
 * Rows are in planner order (top to bottom, across all sections).
 * Section membership is implicit in row order; no section separator rows
 * are emitted because the column set is intentionally kept simple.
 */

import type { Route } from '@/types/route';
import type { TaskView } from '@/types/task';
import { isNaReqs } from '@/utils/routePluginFormat';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpreadsheetRow = {
  order: number;
  name: string;
  task: string;
  requirements: string;
  pts: string;
  notes: string;
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/**
 * Wrap a cell value in double-quotes if it contains a comma, newline, or
 * double-quote character. Internal double-quotes are escaped by doubling them.
 * This produces output that opens correctly in Excel and Google Sheets.
 */
function escapeCell(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─── Row builder ──────────────────────────────────────────────────────────────

/**
 * Build one SpreadsheetRow per route item, in planner order (top to bottom
 * across all sections). Uses the current task dataset for real tasks and
 * falls back gracefully for custom items and unresolved tasks.
 */
export function buildSpreadsheetRows(
  route: Route,
  taskMap: Map<string, TaskView>,
): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = [];
  let order = 1;

  for (const section of route.sections) {
    for (const item of section.items) {
      if (item.isCustom) {
        rows.push({
          order,
          name: item.customName ?? '(custom task)',
          task: item.customDescription ?? '',
          requirements: '',
          pts: '',
          notes: item.note ?? '',
        });
      } else {
        const task = taskMap.get(item.taskId);

        if (!task) {
          // Unresolved — preserve what we can from the identity snapshot
          const snapName =
            item._snap?.name ??
            (() => {
              const m = item.taskId.match(/^task-\d+-(\d+)$/);
              return m ? `Preserved task (sortId ${m[1]})` : 'Preserved task';
            })();

          rows.push({
            order,
            name: snapName,
            task: '',
            requirements: '',
            pts: '?',
            notes: item.note ?? '',
          });
        } else {
          const reqs = isNaReqs(task.requirementsText) ? '' : (task.requirementsText ?? '');
          rows.push({
            order,
            name: task.name,
            task: task.description,
            requirements: reqs,
            pts: String(task.points),
            notes: item.note ?? '',
          });
        }
      }

      order++;
    }
  }

  return rows;
}

// ─── CSV serialiser ───────────────────────────────────────────────────────────

function rowsToCsv(rows: SpreadsheetRow[]): string {
  const header = ['Order', 'Name', 'Task', 'Requirements', 'Pts', 'Notes'];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        escapeCell(String(r.order)),
        escapeCell(r.name),
        escapeCell(r.task),
        escapeCell(r.requirements),
        escapeCell(r.pts),
        escapeCell(r.notes),
      ].join(','),
    ),
  ];
  // CRLF line endings improve Excel compatibility
  return lines.join('\r\n');
}

// ─── Download trigger ─────────────────────────────────────────────────────────

/**
 * Build a CSV from the current route and trigger a browser file download.
 *
 * The UTF-8 BOM (`\uFEFF`) is prepended so Excel and Google Sheets
 * interpret accented/non-ASCII characters correctly without extra steps.
 */
export function downloadRouteCsv(route: Route, taskMap: Map<string, TaskView>): void {
  const rows = buildSpreadsheetRows(route, taskMap);
  const csv = rowsToCsv(rows);
  // UTF-8 BOM keeps Excel happy with any non-ASCII characters in task names
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const safe = (route.name.trim() || 'route').replace(/[^a-z0-9_\- ]/gi, '_');
  const filename = safe + '.csv';

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
