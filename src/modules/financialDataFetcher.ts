import axios, { AxiosResponse } from 'axios'
import { decodeBuffer } from './util'

interface ServiceOptions {
	requestUrl?: string
	stockSymbols: string[]
}

class BasicFetcher {
	protected requestUrl: string
	protected stockSymbols: string[]
	currentIndex: number
	protected errorSymbols: string[]

	constructor({ requestUrl = '', stockSymbols = [] }: ServiceOptions) {
		this.requestUrl = requestUrl
		this.stockSymbols = stockSymbols
		this.currentIndex = 0
		this.errorSymbols = []
	}

	getCurrentSymbol(): string {
		return this.stockSymbols[this.currentIndex]
	}

	addErrorSymbol(): void {
		const symbol = this.getCurrentSymbol()
		this.errorSymbols.push(symbol)
	}

	getAllErrorSymbols(): string[] {
		return this.errorSymbols
	}
}

class Sp500Fetcher extends BasicFetcher {
	constructor(options: ServiceOptions) {
		super(options)
	}

	async fetchHtml(): Promise<string> {
		if (!this.stockSymbols.length) {
			return Promise.reject(new Error('Empty Stock Symbols'))
		}
		if (this.currentIndex >= this.stockSymbols.length) {
			return Promise.reject({ code: 999, msg: 'All symbols have been fetched' })
		}

		const symbol = this.getCurrentSymbol()
		if (!symbol) {
			return Promise.reject(new Error('No symbol found!'))
		}

		const url = `${this.requestUrl}${symbol}`
		if (!url) {
			return Promise.reject(new Error('Empty URL'))
		}

		try {
			const res = await axios.get(url, { responseType: 'arraybuffer' })
			const decodedData = decodeBuffer(res.data)
			return decodedData
		} catch (error) {
			return Promise.reject(error)
		}
	}
}
export default Sp500Fetcher
