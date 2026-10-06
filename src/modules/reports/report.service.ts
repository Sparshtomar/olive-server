import {
  MARKER_CATALOG,
  evaluateMarker,
  type CreateReportInput,
  type MarkerKey,
  type MarkerStatus,
  type MarkerTrend,
  type Report,
  type ReportDraft,
  type ReportSummary,
  type Sex,
} from '@sparshtomar/olive-shared';
import type { BinaryInput, ReportExtractor } from '../../ai';
import { notAReport, notFound, unsupportedFile } from '../../lib/errors';
import { detectImageType, isEncryptedPdf, isHeic, isPdf } from '../../lib/files';
import type { MarkerPoint, ReportRepository, ReportRow } from './report.repository';

const NOT_A_REPORT_FALLBACK = "This doesn't look like a lab report. Try a clearer photo or the PDF from your lab.";

export class ReportService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly extractor: ReportExtractor,
  ) {}

  /** Extracts values for the user to review. Nothing is saved here. */
  async analyze(file: Buffer): Promise<ReportDraft> {
    const draft = await this.extractor.extract(toBinaryInput(file));
    if (!draft.isLabReport) throw notAReport(draft.message ?? NOT_A_REPORT_FALLBACK);
    return draft;
  }

  async create(userId: string, sex: Sex, input: CreateReportInput): Promise<Report> {
    const evaluations = input.markers.map((m) => evaluateMarker(m, sex));
    return toReport(await this.reports.create(userId, input, evaluations));
  }

  async list(userId: string): Promise<ReportSummary[]> {
    const rows = await this.reports.list(userId);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async get(userId: string, id: string): Promise<Report> {
    const row = await this.reports.findById(userId, id);
    if (!row) throw notFound('Report');
    return toReport(row);
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.reports.delete(userId, id))) throw notFound('Report');
  }

  /** One entry per tracked marker, with its history across reports. Flagged markers first. */
  async markerTrends(userId: string, sex: Sex): Promise<MarkerTrend[]> {
    const byKey = groupByKey(await this.reports.trackedHistory(userId));
    const trends = [...byKey.entries()].map(([key, points]): MarkerTrend => {
      const def = MARKER_CATALOG[key];
      const latest = points.at(-1)!;
      return {
        key,
        name: def.name,
        unit: def.unit,
        range: def.range(sex),
        latest: { value: latest.value, status: latest.status, date: latest.date, reportId: latest.reportId },
        history: points.map((p) => ({ date: p.date, value: p.value, reportId: p.reportId })),
        tip: latest.status === 'normal' ? null : (def.tips[latest.status] ?? null),
      };
    });
    const rank = (t: MarkerTrend) => (t.latest.status === 'normal' ? 1 : 0);
    return trends.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  /** Most recent status of every tracked marker - input for nutrition focus. */
  async latestStatuses(userId: string): Promise<{ key: MarkerKey; status: MarkerStatus }[]> {
    const byKey = groupByKey(await this.reports.trackedHistory(userId));
    return [...byKey.entries()].map(([key, points]) => ({ key, status: points.at(-1)!.status }));
  }
}

const groupByKey = (points: MarkerPoint[]) => {
  const map = new Map<MarkerKey, MarkerPoint[]>();
  for (const p of points) map.set(p.key, [...(map.get(p.key) ?? []), p]);
  return map;
};

const toBinaryInput = (data: Buffer): BinaryInput => {
  if (isPdf(data)) {
    if (isEncryptedPdf(data))
      throw unsupportedFile('This PDF is password-protected. Open it, save an unlocked copy, and try again.');
    return { data, mimeType: 'application/pdf' };
  }
  const image = detectImageType(data);
  if (image) return { data, mimeType: image };
  if (isHeic(data)) return { data, mimeType: 'image/heic' };
  throw unsupportedFile('Upload a PDF or a photo (JPEG, PNG, HEIC) of your report');
};

const toReport = (row: ReportRow): Report => ({
  id: row.id,
  title: row.title,
  reportDate: row.reportDate,
  createdAt: row.createdAt.toISOString(),
  markers: row.markers.map((m) => ({
    id: m.id,
    name: m.name,
    value: m.value,
    unit: m.unit,
    refLow: m.refLow,
    refHigh: m.refHigh,
    key: m.markerKey as MarkerKey | null,
    canonicalValue: m.canonicalValue,
    status: m.status,
  })),
});
