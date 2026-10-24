import { NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';
import Anthropic from '@anthropic-ai/sdk';

const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url: string = body.url;

    // 1. Apify visits the website and reads up to 5 pages
    const run = await apify.actor('apify/website-content-crawler').call({
      startUrls: [{ url }],
      maxCrawlPages: 5,
      crawlerType: 'cheerio',
    });
    const dataset = await apify.dataset(run.defaultDatasetId).listItems();
    const pages = dataset.items.map((it: any) => ({
      url: String(it.url),
      text: String(it.text ?? '').slice(0, 3000),
    }));

    // 2. Build the prompt for Claude
    const sourceText = pages
      .map((p) => 'URL: ' + p.url + '\n' + p.text)
      .join('\n\n---\n\n');

    const prompt = [
      'You are a sales research agent. Below are pages scraped from ' + url + '.',
      '1) Summarize the company in 2 sentences.',
      '2) Check whether any facts conflict or look unreliable (employee count, pricing, customers, product claims).',
      'Reply ONLY with JSON: {"summary": string, "conflict": boolean, "question": string, "sources": string[]}',
      '"question" asks a human manager to resolve the conflict (empty string if none).',
      '"sources" = the page URLs you relied on.',
      '',
      sourceText,
    ].join('\n');

    // 3. Claude reads the pages and looks for conflicting facts
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5-5',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    let text = '{}';
    for (const part of msg.content) {
      if (part.type === 'text') {
        text = part.text;
        break;
      }
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const result = JSON.parse(text.slice(start, end + 1));

    return NextResponse.json({ pagesRead: pages.length, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Research failed' }, { status: 500 });
  }
}