import axios from 'axios';
import * as cheerio from 'cheerio';
import _ from 'lodash';
import 'dotenv/config';
import logger from '../logger';
import { db } from '../../db/pg';
import { news } from '../../db/schema';
import { generateHash } from '../crypto'

import { TC_HEADER } from '../../constant/config';
import { zhTimeStringToStandard, normalizeDate } from '../date';

interface NewsData {
	content: string;
	publishedAt: Date | string;
}

function extractDataFromHtml(html: string): NewsData[] {
	const $ = cheerio.load(html);
	const arr: NewsData[] = [];

	$('table').each((_index, element) => {
		let title = $(element).find('.maintitle h1.entry-title a').text();
		// let web_url = $(element).find('.maintitle h1.entry-title a').attr('href') || '';
		let release_time = $(element).find('.head:contains("發布日期")').next().text();

		if (title) {
			title = title.trim();
			const formattedTime = zhTimeStringToStandard(release_time);
			arr.push({
				content: title,
				publishedAt: formattedTime
			});
		}
	});

	return arr.reverse();
}

function getTechNewsUrl(page: number): string {
	if (page <= 0) {
		return process.env.TECHNEWS_URL || '';
	}
	return `${process.env.TECHNEWS_URL}page/${page}/`;
}

async function fetchTechNews(page: number): Promise<NewsData[]> {
	const techUrl = getTechNewsUrl(page);
	const res = await axios.get(techUrl, { headers: TC_HEADER });
	const data = _.get(res, 'data', {});
	return extractDataFromHtml(data);
}

export async function crawlTechNews(): Promise<void> {
	const totalPage = 5;
	const sleepTime = 10 * 1000;

	try {
		for (let page = totalPage; page >= 0; page--) {
			console.log(`正在爬取第 ${page} 頁...`);
			const articles = await fetchTechNews(page);

			if (!articles.length) {
				logger.warn(`第 ${page} 頁沒解析出資料，跳過。`);
				continue;
			}

			for (const article of articles) {
				const parsedDate = normalizeDate(article.publishedAt);
				if (!parsedDate) {
					console.warn(`publishedAt 格式錯誤: ${article.publishedAt}`);
					continue;
				}

				try {
					await db.insert(news)
						.values({
							content: article.content,
							contentHash: generateHash(article.content),
							publishedAt: parsedDate,
							status: 'draft',
						})
						.onConflictDoNothing({ target: news.contentHash });
					// 如果 hash 重複，Drizzle 會自動忽略而不拋出 Error

					console.log(`處理文章: ${article.content.substring(0, 20)}...`);
				} catch (dbError) {
					logger.error(`資料庫寫入失敗: ${dbError}`);
				}
			}

			if (page > 0) {
				await new Promise((resolve) => setTimeout(resolve, sleepTime));
			}
		}
	} catch (e: any) {
		console.error('爬蟲主流程發生嚴重錯誤:', (e as Error).message);
	}
}