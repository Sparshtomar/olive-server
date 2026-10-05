import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { CreateReportInput, MarkerEvaluation, MarkerKey, MarkerStatus } from '@sparshtomar/olive-shared';
import type { Database } from '../../db/client';
import { reportMarkers, reports } from '../../db/schema';

export type ReportRow = typeof reports.$inferSelect & { markers: (typeof reportMarkers.$inferSelect)[] };

export interface ReportSummaryRow {
  id: string;
  title: string;
  reportDate: string;
  createdAt: Date;
  markerCount: number;
  flaggedCount: number;
}

export interface MarkerPoint {
  key: MarkerKey;
  reportId: string;
  date: string;
  value: number;
  status: MarkerStatus;
}

export class ReportRepository {
  constructor(private readonly db: Database) {}

  async create(userId: string, input: CreateReportInput, evaluations: MarkerEvaluation[]): Promise<ReportRow> {
    return this.db.transaction(async (tx) => {
      const [report] = await tx
        .insert(reports)
        .values({ userId, title: input.title, reportDate: input.reportDate })
        .returning({ id: reports.id });

      await tx.insert(reportMarkers).values(
        input.markers.map((m, position) => {
          const e = evaluations[position]!;
          return {
            reportId: report!.id,
            position,
            ...m,
            markerKey: e.key,
            canonicalValue: e.canonicalValue,
            status: e.status,
          };
        }),
      );

      const row = await tx.query.reports.findFirst({
        where: eq(reports.id, report!.id),
        with: { markers: { orderBy: asc(reportMarkers.position) } },
      });
      return row!;
    });
  }

  async list(userId: string): Promise<ReportSummaryRow[]> {
    return this.db
      .select({
        id: reports.id,
        title: reports.title,
        reportDate: reports.reportDate,
        createdAt: reports.createdAt,
        markerCount: sql<number>`count(${reportMarkers.id})`.mapWith(Number),
        flaggedCount: sql<number>`count(*) filter (where ${reportMarkers.status} in ('low', 'high'))`.mapWith(Number),
      })
      .from(reports)
      .leftJoin(reportMarkers, eq(reportMarkers.reportId, reports.id))
      .where(eq(reports.userId, userId))
      .groupBy(reports.id)
      .orderBy(desc(reports.reportDate), desc(reports.createdAt));
  }

  async findById(userId: string, id: string): Promise<ReportRow | undefined> {
    return this.db.query.reports.findFirst({
      where: and(eq(reports.id, id), eq(reports.userId, userId)),
      with: { markers: { orderBy: asc(reportMarkers.position) } },
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(reports)
      .where(and(eq(reports.id, id), eq(reports.userId, userId)))
      .returning({ id: reports.id });
    return deleted.length > 0;
  }

  /** Every tracked value across the user's reports, oldest first. */
  async trackedHistory(userId: string): Promise<MarkerPoint[]> {
    const rows = await this.db
      .select({
        key: reportMarkers.markerKey,
        reportId: reports.id,
        date: reports.reportDate,
        value: reportMarkers.canonicalValue,
        status: reportMarkers.status,
      })
      .from(reportMarkers)
      .innerJoin(reports, eq(reports.id, reportMarkers.reportId))
      .where(
        and(
          eq(reports.userId, userId),
          isNotNull(reportMarkers.markerKey),
          isNotNull(reportMarkers.canonicalValue),
          isNotNull(reportMarkers.status),
        ),
      )
      .orderBy(asc(reports.reportDate), asc(reports.createdAt));
    return rows as MarkerPoint[];
  }
}
