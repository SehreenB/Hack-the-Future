export interface ExportRecord {
    country: string;
    export_value: number;
}

export interface ImpactedCountry {
    country: string;
    previous_value: number;
    current_value: number;
    drop_percentage: number;
    status: string;
}

export interface CompanyInfo {
    name: string;
    status: string;
    company_number: string;
    url: string;
}

export class ExportBanTracker {
    private comtradeBase = "https://comtradeapi.un.org/data/v1";
    private opencorpBase = "https://api.opencorporates.com/v0.4";

    private productToHs: Record<string, string> = {
        'lithium batteries': '850760',
        'lithium-ion batteries': '850760',
        'batteries': '850760',
        'semiconductors': '854231',
        'computer chips': '854231',
        'microchips': '854231',
        'rare earth metals': '280530',
        'rare earths': '280530',
        'cobalt': '810520',
        'nickel': '750210',
        'copper': '740311',
        'steel': '720839',
        'aluminum': '760110',
        'wheat': '100199',
        'corn': '100590',
        'soybeans': '120190',
        'crude oil': '270900',
        'natural gas': '271111',
        'pharmaceuticals': '300490',
        'medical equipment': '901890',
        'solar panels': '854140',
        'wind turbines': '850231'
    };

    public getAvailableProducts(): string[] {
        return Object.keys(this.productToHs);
    }

    public convertProductToHs(productName: string): string | null {
        const productLower = productName.toLowerCase().trim();

        if (this.productToHs[productLower]) {
            return this.productToHs[productLower];
        }

        // Partial match
        for (const [key, code] of Object.entries(this.productToHs)) {
            if (key.includes(productLower) || productLower.includes(key)) {
                return code;
            }
        }

        return null;
    }

    public async getExportData(hsCode: string, year: number = 2023): Promise<ExportRecord[]> {
        const url = `${this.comtradeBase}/get/C/A/${year}/M/all/${hsCode}`;

        try {
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();

                if (data && data.data) {
                    const countryExports: Record<string, number> = {};

                    for (const record of data.data) {
                        const reporter = record.reporterDesc || 'Unknown';
                        const value = parseFloat(record.primaryValue || 0);

                        if (countryExports[reporter]) {
                            countryExports[reporter] += value;
                        } else {
                            countryExports[reporter] = value;
                        }
                    }

                    const result: ExportRecord[] = Object.entries(countryExports).map(
                        ([country, export_value]) => ({ country, export_value })
                    );

                    result.sort((a, b) => b.export_value - a.export_value);
                    return result;
                } else {
                    return [];
                }
            } else {
                return [];
            }
        } catch (e) {
            console.error("ExportBanTracker Error: ", e);
            return [];
        }
    }

    public async detectExportBans(hsCode: string): Promise<ImpactedCountry[]> {
        const currentYear = new Date().getFullYear();
        const currentData = await this.getExportData(hsCode, currentYear - 1);

        // basic wait to prevent rate limit on free tier APIs
        await new Promise(resolve => setTimeout(resolve, 2000));
        const previousData = await this.getExportData(hsCode, currentYear - 3);

        if (!currentData.length || !previousData.length) {
            return [];
        }

        const previousLookup: Record<string, number> = {};
        for (const d of previousData) {
            previousLookup[d.country] = d.export_value;
        }

        const impactedCountries: ImpactedCountry[] = [];

        for (const current of currentData.slice(0, 20)) {
            const country = current.country;
            const currentValue = current.export_value;

            if (previousLookup[country] !== undefined) {
                const previousValue = previousLookup[country];

                if (previousValue > 0) {
                    const dropPct = ((previousValue - currentValue) / previousValue) * 100;

                    if (dropPct > 50) {
                        impactedCountries.push({
                            country,
                            previous_value: previousValue,
                            current_value: currentValue,
                            drop_percentage: dropPct,
                            status: 'Possible Export Ban/Restriction'
                        });
                    }
                }
            }
        }

        return impactedCountries;
    }

    public async getSafeExporters(hsCode: string, impacted: ImpactedCountry[], topN: number = 10): Promise<ExportRecord[]> {
        const currentData = await this.getExportData(hsCode);
        if (!currentData.length) {
            return [];
        }

        const impactedNames = new Set(impacted.map(c => c.country));
        const safe = currentData.filter(c => !impactedNames.has(c.country));

        return safe.slice(0, topN);
    }

    public async findCompanies(countryName: string, keywords: string, maxResults: number = 5): Promise<CompanyInfo[]> {
        const countryCodes: Record<string, string> = {
            'china': 'cn', 'united states': 'us', 'usa': 'us', 'germany': 'de',
            'japan': 'jp', 'korea': 'kr', 'france': 'fr',
            'italy': 'it', 'united kingdom': 'gb', 'uk': 'gb', 'canada': 'ca',
            'australia': 'au', 'india': 'in', 'brazil': 'br'
        };

        let jurisdiction: string | null = null;
        const lowerName = countryName.toLowerCase();
        for (const [name, code] of Object.entries(countryCodes)) {
            if (lowerName.includes(name)) {
                jurisdiction = code;
                break;
            }
        }

        if (!jurisdiction) {
            return [];
        }

        const url = `${this.opencorpBase}/companies/search`;
        const params = new URLSearchParams({
            q: keywords,
            jurisdiction_code: jurisdiction,
            per_page: maxResults.toString()
        });

        try {
            const response = await fetch(`${url}?${params.toString()}`);

            if (response.ok) {
                const data = await response.json();
                const companies: CompanyInfo[] = [];

                if (data.results && data.results.companies) {
                    for (const companyData of data.results.companies) {
                        const company = companyData.company || {};
                        companies.push({
                            name: company.name || 'N/A',
                            status: company.current_status || 'N/A',
                            company_number: company.company_number || 'N/A',
                            url: company.opencorporates_url || 'N/A'
                        });
                    }
                }

                return companies;
            } else {
                return [];
            }
        } catch (e) {
            console.error("ExportBanTracker Error: ", e);
            return [];
        }
    }
}

export const exportBanTracker = new ExportBanTracker();
