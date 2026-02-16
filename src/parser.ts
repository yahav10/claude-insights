import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import type { ReportData } from './types.js';

export function parseReport(filePath: string): ReportData {
  const html = readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim();
  const subtitle = $('.subtitle').first().text().trim();

  const stats = $('.stat').map((_, el) => ({
    value: $(el).find('.stat-value').text().trim(),
    label: $(el).find('.stat-label').text().trim(),
  })).get();

  const glance = $('.glance-section').map((_, el) => {
    const strong = $(el).find('strong').first().text().trim().replace(/:$/, '');
    const text = $(el).text().trim();
    return { label: strong, text };
  }).get();

  const projects = $('.project-area').map((_, el) => ({
    name: $(el).find('.area-name').text().trim(),
    count: $(el).find('.area-count').text().trim(),
    description: $(el).find('.area-desc').text().trim(),
  })).get();

  const charts = $('.chart-card').map((_, el) => {
    const chartTitle = $(el).find('.chart-title').first().text().trim();
    const bars = $(el).find('.bar-row').map((_, row) => {
      const label = $(row).find('.bar-label').text().trim();
      const valueText = $(row).find('.bar-value').text().trim();
      const value = parseInt(valueText, 10) || 0;
      const fillStyle = $(row).find('.bar-fill').attr('style') || '';
      const widthMatch = fillStyle.match(/width:\s*([\d.]+)%/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : 0;
      return { label, value, width };
    }).get();
    return { title: chartTitle, bars };
  }).get();

  const narrativeParagraphs = $('.narrative p').map((_, el) => $(el).text().trim()).get();
  const keyInsight = $('.key-insight').first().text().trim();
  const narrative = { paragraphs: narrativeParagraphs, keyInsight };

  const wins = $('.big-win').map((_, el) => ({
    title: $(el).find('.big-win-title').text().trim(),
    description: $(el).find('.big-win-desc').text().trim(),
  })).get();

  const frictions = $('.friction-category').map((_, el) => ({
    title: $(el).find('.friction-title').text().trim(),
    description: $(el).find('.friction-desc').text().trim(),
    examples: $(el).find('.friction-examples li').map((_, li) => $(li).text().trim()).get(),
  })).get();

  const claudeMdItems = $('.claude-md-item').map((_, el) => ({
    code: $(el).find('.cmd-code').text().trim(),
    why: $(el).find('.cmd-why').text().trim(),
  })).get();

  const features = $('.feature-card').map((_, el) => ({
    title: $(el).find('.feature-title').text().trim(),
    oneliner: $(el).find('.feature-oneliner').text().trim(),
    why: $(el).find('.feature-why').text().trim(),
    examples: $(el).find('.example-code').map((_, code) => $(code).text().trim()).get(),
  })).get();

  const patterns = $('.pattern-card').map((_, el) => ({
    title: $(el).find('.pattern-title').text().trim(),
    summary: $(el).find('.pattern-summary').text().trim(),
    detail: $(el).find('.pattern-detail').text().trim(),
    prompt: $(el).find('.copyable-prompt').text().trim(),
  })).get();

  const horizon = $('.horizon-card').map((_, el) => ({
    title: $(el).find('.horizon-title').text().trim(),
    possible: $(el).find('.horizon-possible').text().trim(),
    tip: $(el).find('.horizon-tip').text().trim(),
    prompt: $(el).find('.pattern-prompt code').text().trim(),
  })).get();

  const funEnding = {
    headline: $('.fun-headline').first().text().trim(),
    detail: $('.fun-detail').first().text().trim(),
  };

  return {
    title, subtitle, stats, glance, projects, charts,
    narrative, wins, frictions, claudeMdItems, features,
    patterns, horizon, funEnding,
  };
}
