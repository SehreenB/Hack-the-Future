import { Panel } from './Panel';
import { exportBanTracker, type CompanyInfo, type ImpactedCountry } from '@/services/exportTracker';
import { escapeHtml } from '@/utils/sanitize';

export class ExportBanTrackerPanel extends Panel {
  private formNode!: HTMLFormElement;
  private inputNode!: HTMLInputElement;
  private resultsNode!: HTMLDivElement;
  private submitNode!: HTMLButtonElement;

  constructor() {
    super({
      id: 'export-ban',
      title: 'Alternative Suppliers',
      glowing: true,
    });
    this.initUI();
  }

  private initUI(): void {
    const html = `
      <div class="export-ban-container">
        <form class="export-ban-form" id="export-ban-form-export-ban">
          <input type="text" class="export-ban-input" id="export-ban-input-export-ban" placeholder="Enter product e.g. Lithium Batteries" required />
          <button type="submit" class="export-ban-btn" id="export-ban-submit-export-ban">Analyze</button>
        </form>
        <div class="export-ban-results" id="export-ban-results-export-ban">
          <div class="export-ban-empty">Enter a product to find alternative suppliers and track export restrictions.</div>
        </div>
      </div>
    `;

    this.setContent(html);

    this.formNode = this.getElement().querySelector(`#export-ban-form-export-ban`) as HTMLFormElement;
    this.inputNode = this.getElement().querySelector(`#export-ban-input-export-ban`) as HTMLInputElement;
    this.resultsNode = this.getElement().querySelector(`#export-ban-results-export-ban`) as HTMLDivElement;
    this.submitNode = this.getElement().querySelector(`#export-ban-submit-export-ban`) as HTMLButtonElement;

    this.formNode.addEventListener('submit', (e) => {
      e.preventDefault();
      const product = this.inputNode.value.trim();
      if (product) {
        this.runAnalysis(product);
      }
    });
  }

  private async runAnalysis(productName: string): Promise<void> {
    this.submitNode.disabled = true;
    this.inputNode.disabled = true;

    this.resultsNode.innerHTML = `
      <div class="export-ban-loading">
        <div class="processing-spinner"></div>
        <div class="loading-text" id="export-ban-status-export-ban">Resolving HS Code...</div>
      </div>
    `;
    const statusText = this.resultsNode.querySelector(`#export-ban-status-export-ban`) as HTMLDivElement;

    try {
      // Step 1: HS Code
      const hsCode = exportBanTracker.convertProductToHs(productName);

      if (!hsCode) {
        const available = exportBanTracker.getAvailableProducts().slice(0, 5).join(', ') + '...';
        this.resultsNode.innerHTML = `
          <div class="export-ban-error">
            <p><strong>No HS Code found for '${escapeHtml(productName)}'</strong></p>
            <p class="export-hint">Try: ${escapeHtml(available)}</p>
          </div>
        `;
        return;
      }

      statusText.textContent = `Analyzing export patterns for HS Code: ${hsCode}...`;

      // Step 2: Detect bans
      const impacted = await exportBanTracker.detectExportBans(hsCode);

      statusText.textContent = `Finding safe alternative exporters...`;

      // Step 3: Safe exporters
      const safe = await exportBanTracker.getSafeExporters(hsCode, impacted, 10);

      if (safe.length === 0) {
        this.resultsNode.innerHTML = `
          <div class="export-ban-error">
            <p><strong>Failed to retrieve export data.</strong></p>
            <p class="export-hint">The UN Comtrade API may be rate-limited or unavailable.</p>
          </div>
        `;
        return;
      }

      statusText.textContent = `Searching for suppliers...`;

      // Step 4: Companies
      const keywords = productName.split(' ')[0] || productName;
      const topSafe = safe.slice(0, 3);

      const allCompanies: Record<string, CompanyInfo[]> = {};

      for (const exporter of topSafe) {
        statusText.textContent = `Searching ${exporter.country}...`;
        const companies = await exportBanTracker.findCompanies(exporter.country, keywords, 4);
        if (companies.length > 0) {
          allCompanies[exporter.country] = companies;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // avoid rate limits
      }

      this.renderReport(productName, hsCode, impacted, allCompanies);

    } catch (e) {
      this.resultsNode.innerHTML = `<div class="export-ban-error">An error occurred during analysis.</div>`;
      console.error(e);
    } finally {
      this.submitNode.disabled = false;
      this.inputNode.disabled = false;
    }
  }

  private renderReport(
    productName: string,
    hsCode: string,
    impacted: ImpactedCountry[],
    allCompanies: Record<string, CompanyInfo[]>
  ): void {

    let html = `<div class="export-ban-report">`;

    html += `<div class="report-header">
      <span class="report-title">${escapeHtml(productName)}</span>
      <span class="report-hs">HS: ${hsCode}</span>
    </div>`;

    if (impacted.length > 0) {
      html += `
        <div class="report-section impact-section">
          <div class="section-title warning-text">⚠️ Export Restrictions Detected</div>
          <ul class="impact-list">
            ${impacted.map(c => `
              <li>
                <span class="country-name">${escapeHtml(c.country)}</span>
                <span class="drop-val">-${c.drop_percentage.toFixed(0)}% Vol.</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    } else {
      html += `
        <div class="report-section">
          <div class="section-title success-text">✅ No Major Restrictions Detected</div>
        </div>
      `;
    }

    html += `
      <div class="report-section">
        <div class="section-title">🏭 Alternative Suppliers Found</div>
    `;

    const countries = Object.keys(allCompanies);

    if (countries.length > 0) {
      html += `<div class="company-accordion">`;

      countries.forEach(country => {
        html += `
          <div class="country-group">
            <div class="country-header">${escapeHtml(country)}</div>
            <div class="company-list">
              ${(allCompanies[country] || []).map(company => `
                <div class="company-card">
                  <div class="company-name">${escapeHtml(company.name)}</div>
                  <div class="company-meta">
                    <span class="status-badge ${company.status.toLowerCase() == 'active' ? 'active' : ''}">${escapeHtml(company.status)}</span>
                    <a href="${company.url}" target="_blank" class="company-link">Verify ↗</a>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      });

      html += `</div>`;
    } else {
      html += `
        <div class="empty-companies">
          No matches found in top exporting countries.
        </div>
      `;
    }

    html += `</div></div>`;
    this.resultsNode.innerHTML = html;
  }
}
