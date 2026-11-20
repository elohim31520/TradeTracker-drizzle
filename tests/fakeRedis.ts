/**
 * 記憶體版的 Redis：只實作卡包服務用到的指令。
 * 用 jest.mock('../src/modules/redis', () => ({ __esModule: true, default: require('./fakeRedis').createFakeRedis() })) 換掉真的連線。
 * expiries 記錄每個 key 最後一次設定的 TTL（秒），測試可以檢查；不會真的過期。
 */
export function createFakeRedis() {
    const strings = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    const lists = new Map<string, string[]>();
    const expiries = new Map<string, number>();

    const has = (key: string) => strings.has(key) || sets.has(key) || lists.has(key);

    const api = {
        isOpen: true,
        isReady: true,
        strings,
        sets,
        lists,
        expiries,

        reset() {
            strings.clear();
            sets.clear();
            lists.clear();
            expiries.clear();
        },

        async get(key: string) {
            return strings.get(key) ?? null;
        },
        async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
            if (options?.NX && has(key)) return null;
            strings.set(key, String(value));
            if (options?.EX) expiries.set(key, options.EX);
            return 'OK';
        },
        async del(keys: string | string[]) {
            let removed = 0;
            for (const key of Array.isArray(keys) ? keys : [keys]) {
                const existed = has(key);
                strings.delete(key);
                sets.delete(key);
                lists.delete(key);
                expiries.delete(key);
                if (existed) removed++;
            }
            return removed;
        },
        async exists(key: string) {
            return has(key) ? 1 : 0;
        },
        async incr(key: string) {
            const next = Number(strings.get(key) ?? 0) + 1;
            strings.set(key, String(next));
            return next;
        },
        async expire(key: string, seconds: number) {
            expiries.set(key, seconds);
            return 1;
        },
        async sAdd(key: string, member: string) {
            const set = sets.get(key) ?? new Set<string>();
            set.add(member);
            sets.set(key, set);
            return 1;
        },
        async sMembers(key: string) {
            return [...(sets.get(key) ?? [])];
        },
        async lPush(key: string, value: string) {
            const list = lists.get(key) ?? [];
            list.unshift(value);
            lists.set(key, list);
            return list.length;
        },
        async lTrim(key: string, start: number, stop: number) {
            const list = lists.get(key);
            if (list) lists.set(key, list.slice(start, stop + 1));
            return 'OK';
        },
        async lRange(key: string, start: number, stop: number) {
            return (lists.get(key) ?? []).slice(start, stop + 1);
        },

        /** 依序執行，沒有真正的交易隔離（單執行緒的測試夠用） */
        multi() {
            const ops: Array<() => Promise<unknown>> = [];
            const builder = {
                incr: (key: string) => (ops.push(() => api.incr(key)), builder),
                expire: (key: string, seconds: number) => (ops.push(() => api.expire(key, seconds)), builder),
                sAdd: (key: string, member: string) => (ops.push(() => api.sAdd(key, member)), builder),
                lPush: (key: string, value: string) => (ops.push(() => api.lPush(key, value)), builder),
                lTrim: (key: string, start: number, stop: number) => (ops.push(() => api.lTrim(key, start, stop)), builder),
                exec: async () => {
                    const results: unknown[] = [];
                    for (const op of ops) results.push(await op());
                    return results;
                },
            };
            return builder;
        },
    };
    return api;
}

export type FakeRedis = ReturnType<typeof createFakeRedis>;
