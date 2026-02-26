import { db } from '../db/pg';
import { companyMetrics, companies } from '../db/schema';
import { eq, gte, and, desc, sql } from 'drizzle-orm';
import { getZonedDate, subtractDays } from '../modules/date';

export async function getBySymbol(symbol: string, days?: number) {
    const filters = [];
    filters.push(eq(companies.symbol, symbol));

    if (days) {
        const date = subtractDays(getZonedDate(), Number(days));
        filters.push(gte(companyMetrics.createdAt, date));
    }

    const data = await db
        .select({
            sb: companies.symbol,
            pr: companyMetrics.price,
            pe: companyMetrics.peTrailing,
            fpe: companyMetrics.peForward,
            eps: companyMetrics.epsTrailing,
            feps: companyMetrics.epsForward,
            v: companyMetrics.volume,
            cap: companyMetrics.marketCap,
            ct: sql<string>`TO_CHAR(${companyMetrics.createdAt}, 'YYYY-MM-DD"T"HH24:MI')`,
        })
        .from(companyMetrics)
        .innerJoin(companies, eq(companyMetrics.companyId, companies.id))
        .where(and(...filters))
        .orderBy(desc(companyMetrics.createdAt));

    return data;
}

export default {
    getBySymbol
}
