import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseReportHtml, parseReport } from '../parser.js';
import { readFileSync } from 'node:fs';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function loadFixture(name: string): string {
  return readFileSync(fixturePath(name), 'utf-8');
}

describe('parser', () => {
  describe('full report', () => {
    const data = parseReportHtml(loadFixture('full-report.html'));

    it('parses the title', () => {
      expect(data.title).toBe('Widget Configuration Insights');
    });

    it('parses the subtitle', () => {
      expect(data.subtitle).toBe('Analysis of 14 sessions over 30 days');
    });

    it('parses 2 stats', () => {
      expect(data.stats).toHaveLength(2);
      expect(data.stats[0]).toEqual({ value: '127', label: 'Messages' });
      expect(data.stats[1]).toEqual({ value: '14', label: 'Sessions' });
    });

    it('parses 1 glance section', () => {
      expect(data.glance).toHaveLength(1);
      expect(data.glance[0].label).toBe('Primary Focus');
    });

    it('parses 2 project areas', () => {
      expect(data.projects).toHaveLength(2);
      expect(data.projects[0].name).toBe('Widget Library');
      expect(data.projects[0].count).toBe('42 messages');
      expect(data.projects[0].description).toBe('Core widget components and configuration');
      expect(data.projects[1].name).toBe('Dashboard App');
    });

    it('parses 1 chart with 2 bars', () => {
      expect(data.charts).toHaveLength(1);
      expect(data.charts[0].title).toBe('Activity by Category');
      expect(data.charts[0].bars).toHaveLength(2);
      expect(data.charts[0].bars[0]).toEqual({ label: 'Bug Fixes', value: 8, width: 73.5 });
      expect(data.charts[0].bars[1]).toEqual({ label: 'Features', value: 5, width: 45.2 });
    });

    it('parses narrative with 2 paragraphs and key insight', () => {
      expect(data.narrative.paragraphs).toHaveLength(2);
      expect(data.narrative.paragraphs[0]).toContain('widget configuration');
      expect(data.narrative.keyInsight).toContain('40%');
    });

    it('parses 2 big wins', () => {
      expect(data.wins).toHaveLength(2);
      expect(data.wins[0].title).toBe('Rapid Component Scaffolding');
      expect(data.wins[0].description).toContain('12 new components');
      expect(data.wins[1].title).toBe('Test Coverage Boost');
    });

    it('parses 2 friction categories with 2 examples each', () => {
      expect(data.frictions).toHaveLength(2);
      expect(data.frictions[0].title).toBe('Widget Configuration Errors');
      expect(data.frictions[0].description).toContain('misconfigured widget props');
      expect(data.frictions[0].examples).toHaveLength(2);
      expect(data.frictions[0].examples[0]).toContain('dropdown widgets');
      expect(data.frictions[1].title).toBe('CSS Scoping Mistakes');
      expect(data.frictions[1].examples).toHaveLength(2);
    });

    it('parses 2 CLAUDE.md items', () => {
      expect(data.claudeMdItems).toHaveLength(2);
      expect(data.claudeMdItems[0].code).toContain('CSS custom properties');
      expect(data.claudeMdItems[0].why).toContain('Inline styles');
      expect(data.claudeMdItems[1].code).toContain('debugging');
    });

    it('parses 1 feature card with hooks example', () => {
      expect(data.features).toHaveLength(1);
      expect(data.features[0].title).toBe('Pre-commit Hooks');
      expect(data.features[0].oneliner).toContain('Catch lint');
      expect(data.features[0].examples).toHaveLength(1);
      expect(data.features[0].examples[0]).toContain('hooks');
    });

    it('parses 1 pattern card', () => {
      expect(data.patterns).toHaveLength(1);
      expect(data.patterns[0].title).toBe('Scoped CSS Review');
      expect(data.patterns[0].summary).toContain('Review all CSS');
      expect(data.patterns[0].detail).toContain('style leakage');
      expect(data.patterns[0].prompt).toContain('shadow DOM');
    });

    it('parses 1 horizon card', () => {
      expect(data.horizon).toHaveLength(1);
      expect(data.horizon[0].title).toBe('Automated Visual Regression');
    });

    it('parses fun ending', () => {
      expect(data.funEnding.headline).toBe('Widget Wizard');
      expect(data.funEnding.detail).toContain('factory assembly line');
    });
  });

  describe('minimal report', () => {
    const data = parseReportHtml(loadFixture('minimal-report.html'));

    it('parses the title', () => {
      expect(data.title).toBe('Minimal Report');
    });

    it('has 1 friction with 1 example', () => {
      expect(data.frictions).toHaveLength(1);
      expect(data.frictions[0].title).toBe('Build Failures');
      expect(data.frictions[0].examples).toHaveLength(1);
    });

    it('has 1 CLAUDE.md item', () => {
      expect(data.claudeMdItems).toHaveLength(1);
      expect(data.claudeMdItems[0].code).toContain('import paths');
    });

    it('has empty arrays for missing sections', () => {
      expect(data.stats).toHaveLength(0);
      expect(data.projects).toHaveLength(0);
      expect(data.charts).toHaveLength(0);
      expect(data.wins).toHaveLength(0);
      expect(data.features).toHaveLength(0);
      expect(data.patterns).toHaveLength(0);
      expect(data.horizon).toHaveLength(0);
    });

    it('has empty subtitle', () => {
      expect(data.subtitle).toBe('');
    });
  });

  describe('empty report', () => {
    const data = parseReportHtml(loadFixture('empty-report.html'));

    it('returns empty title', () => {
      expect(data.title).toBe('');
    });

    it('returns all arrays empty', () => {
      expect(data.stats).toHaveLength(0);
      expect(data.glance).toHaveLength(0);
      expect(data.projects).toHaveLength(0);
      expect(data.charts).toHaveLength(0);
      expect(data.narrative.paragraphs).toHaveLength(0);
      expect(data.narrative.keyInsight).toBe('');
      expect(data.wins).toHaveLength(0);
      expect(data.frictions).toHaveLength(0);
      expect(data.claudeMdItems).toHaveLength(0);
      expect(data.features).toHaveLength(0);
      expect(data.patterns).toHaveLength(0);
      expect(data.horizon).toHaveLength(0);
    });

    it('returns empty fun ending', () => {
      expect(data.funEnding.headline).toBe('');
      expect(data.funEnding.detail).toBe('');
    });
  });

  describe('malformed report', () => {
    it('does not throw', () => {
      expect(() => parseReportHtml(loadFixture('malformed-report.html'))).not.toThrow();
    });

    it('returns a valid ReportData structure', () => {
      const data = parseReportHtml(loadFixture('malformed-report.html'));
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('subtitle');
      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('frictions');
      expect(data).toHaveProperty('claudeMdItems');
      expect(Array.isArray(data.stats)).toBe(true);
      expect(Array.isArray(data.frictions)).toBe(true);
    });

    it('parses stats with missing children as empty strings', () => {
      const data = parseReportHtml(loadFixture('malformed-report.html'));
      // There is one .stat div but with no .stat-value or .stat-label
      expect(data.stats).toHaveLength(1);
      expect(data.stats[0].value).toBe('');
      expect(data.stats[0].label).toBe('');
    });

    it('parses friction with missing children as empty strings', () => {
      const data = parseReportHtml(loadFixture('malformed-report.html'));
      expect(data.frictions).toHaveLength(1);
      expect(data.frictions[0].title).toBe('');
      expect(data.frictions[0].description).toBe('');
      expect(data.frictions[0].examples).toHaveLength(0);
    });
  });

  describe('bar width parsing', () => {
    it('parses decimal width from style attribute', () => {
      const html = `
        <div class="chart-card">
          <div class="chart-title">Test Chart</div>
          <div class="bar-row">
            <span class="bar-label">Item</span>
            <span class="bar-value">10</span>
            <div class="bar-fill" style="width: 73.5%"></div>
          </div>
        </div>
      `;
      const data = parseReportHtml(html);
      expect(data.charts[0].bars[0].width).toBe(73.5);
    });

    it('returns 0 when no width style is present', () => {
      const html = `
        <div class="chart-card">
          <div class="chart-title">Test Chart</div>
          <div class="bar-row">
            <span class="bar-label">Item</span>
            <span class="bar-value">10</span>
            <div class="bar-fill"></div>
          </div>
        </div>
      `;
      const data = parseReportHtml(html);
      expect(data.charts[0].bars[0].width).toBe(0);
    });

    it('parses integer width', () => {
      const html = `
        <div class="chart-card">
          <div class="chart-title">Test Chart</div>
          <div class="bar-row">
            <span class="bar-label">Item</span>
            <span class="bar-value">3</span>
            <div class="bar-fill" style="width: 100%"></div>
          </div>
        </div>
      `;
      const data = parseReportHtml(html);
      expect(data.charts[0].bars[0].width).toBe(100);
    });
  });

  describe('parseReport (file-based)', () => {
    it('reads and parses an HTML file from disk', () => {
      const data = parseReport(fixturePath('full-report.html'));
      expect(data.title).toBe('Widget Configuration Insights');
      expect(data.frictions).toHaveLength(2);
    });
  });
});
