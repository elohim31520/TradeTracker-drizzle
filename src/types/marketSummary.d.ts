export interface MarketSummaryContent {
    headline: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    highlights: string[];
    summary: string;
    sectors: { name: string; change: string; note: string }[];
}

export interface MarketSummary {
    date: string;
    generated_at: string;
    zh: MarketSummaryContent;
    en: MarketSummaryContent;
}