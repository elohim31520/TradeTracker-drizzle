import { db } from './pg';
import { assets } from './schema';

async function main() {
    console.log('🌱 開始植入 Asset 資料...');

    const data = [
        {
            symbol: 'USOIL',
            baseAsset: 'WTI',
            quoteAsset: 'USD',
            decimalPlaces: 3,
        },
        {
            symbol: 'US10Y',
            baseAsset: 'US10Y',
            quoteAsset: 'PERCENT',
            decimalPlaces: 3,
        },
        {
            symbol: 'XAUUSD',
            baseAsset: 'XAU',
            quoteAsset: 'USD',
            decimalPlaces: 2,
        },
        {
            symbol: 'BTCUSD',
            baseAsset: 'BTC',
            quoteAsset: 'USD',
            decimalPlaces: 2,
        },
        {
            symbol: 'DXY',
            baseAsset: 'DXY',
            quoteAsset: 'INDEX',
            decimalPlaces: 3,
        },
    ];

    for (const row of data) {
        await db.insert(assets).values(row).onConflictDoUpdate({
            target: assets.symbol,
            set: {
                baseAsset: row.baseAsset,
                quoteAsset: row.quoteAsset,
                decimalPlaces: row.decimalPlaces,
                updatedAt: new Date(),
            },
        });
    }

    console.log('✅ Seed 執行完成！');
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Seed 失敗：', err);
    process.exit(1);
});