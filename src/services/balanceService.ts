import { db } from '../db/pg';
import { userBalances, userBalanceLogs } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export async function getBalance(userId: string) {
	const [result] = await db
		.select({ balance: userBalances.balance })
		.from(userBalances)
		.where(
			and(
				eq(userBalances.userId, userId),
				eq(userBalances.currency, 'USD')
			)
		)
		.limit(1);

	// 注意：numeric 在 Drizzle/PG 會回傳字串，若需要數字請自行轉換
	return result || null;
}

export async function createBalance(userId: string, balance: number) {
	return await db.insert(userBalances).values({
		userId,
		currency: 'USD',
		balance: balance.toString(), // numeric 接受字串以確保精度
	}).returning();
}

export async function updateBalance(userId: string, targetBalance: number, type: string = "update", refId?: string) {
	return await db.transaction(async (tx) => {
		const [wallet] = await tx
			.select()
			.from(userBalances)
			.where(
				and(
					eq(userBalances.userId, userId),
					eq(userBalances.currency, 'USD')
				)
			)
			.for('update');

		if (!wallet) throw new Error('Wallet not found');

		const oldBalance = Number(wallet.balance);
		const amount = targetBalance - oldBalance;

		if (amount === 0) return { newBalance: oldBalance };

		await tx
			.update(userBalances)
			.set({
				balance: targetBalance.toFixed(2), // 確保格式符合 numeric
				updatedAt: new Date()
			})
			.where(eq(userBalances.id, wallet.id));

		// 4. 寫入流水帳 (保留變動過程)
		await tx.insert(userBalanceLogs).values({
			userId,
			currency: 'USD',
			amount: amount.toFixed(2),
			balanceBefore: oldBalance.toFixed(2),
			balanceAfter: targetBalance.toFixed(2),
			type,
			referenceId: refId,
		});

		return { balance: targetBalance };
	});
}

export default {
	getBalance,
	createBalance,
	updateBalance,
}