/**
 * 手動產生卡包的卡池。用法（在專案根目錄）：
 *
 *   npx tsx script/generateCardPack.ts --dry                 只抓行情、算訊號與稀有度，印出表格與一份範例 prompt（不呼叫 Gemini、不碰 Redis）
 *   npx tsx script/generateCardPack.ts --no-write            呼叫 Gemini 生成，結果存成 JSON 檔，不寫 Redis（需要 Vertex AI 憑證）
 *   npx tsx script/generateCardPack.ts --only=AMD,NVDA       只處理指定公司（省額度；一律不寫 Redis）
 *   npx tsx script/generateCardPack.ts                       正式：生成並寫入 Redis（Redis 要先啟動）
 *   加上 --force 會在當天卡池已存在時強制重生；--out=路徑 指定 JSON 輸出位置
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { HOT_COMPANIES } from '../src/constant/hotCompanies';
import { collectSnapshots } from '../src/modules/cardPack/marketData';
import { assignRarities } from '../src/modules/cardPack/signals';
import { buildPrompt } from '../src/modules/cardPack/cardContent';
import { generateCardPack } from '../src/modules/cardPack/cardPackGenerator';
import { connectRedis } from '../src/modules/redis';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
    const only = option('only')?.toUpperCase().split(',').filter(Boolean);
    const companies = only ? HOT_COMPANIES.filter((c) => only.includes(c.symbol)) : HOT_COMPANIES;
    if (!companies.length) throw new Error(`--only 沒有符合的公司：${only?.join(',')}`);

    if (flag('dry')) {
        const { date, snapshots } = await collectSnapshots(companies);
        const rarities = assignRarities(snapshots.map((s) => ({ symbol: s.symbol, score: s.signals.score })));
        const ranked = [...snapshots].sort((a, b) => b.signals.score - a.signals.score);

        console.log(`\n池子日期（美東交易日）：${date}　共 ${snapshots.length} 家\n`);
        console.table(
            ranked.map((s) => ({
                symbol: s.symbol,
                rarity: rarities.get(s.symbol),
                score: s.signals.score,
                src: s.todaySource,
                base: s.baselineStale ? 'stale' : 'ok',
                dayChg: s.signals.dayChgPct,
                moveX: s.signals.moveMultiple,
                volumeX: s.signals.volumeRatio,
                chg20d: s.signals.change20dPct,
                price: s.signals.price,
            }))
        );
        console.log('--- 範例 prompt（分數最高的一家）---');
        console.log(buildPrompt(ranked[0]!));
        return;
    }

    const write = !flag('no-write') && !only;
    if (write) await connectRedis();

    const pool = await generateCardPack({ companies, force: flag('force'), write });
    if (!pool) {
        console.log('這次沒有產生卡池（盤中，或當天卡池已存在；已存在時可加 --force）');
        return;
    }

    if (!pool.cards.length) throw new Error('沒有任何一張卡生成成功（上面的 warn / error 有各家的原因，例如沒有 Vertex AI 憑證）');

    const out = option('out') ?? path.join(os.tmpdir(), `cardpack-${pool.date}.json`);
    fs.writeFileSync(out, JSON.stringify(pool, null, 2));
    console.log(`\n產生 ${pool.cards.length} 張卡（${pool.date}）${write ? '，已寫入 Redis' : '，未寫入 Redis'}，JSON：${out}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
