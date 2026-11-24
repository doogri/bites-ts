import { extractArticle } from './crawl.js';
import type { Link } from './db/entity/Link.js';

const TITLE_FETCH_TIMEOUT_MS = 10_000;
const MAX_TITLE_LENGTH = 500;
const MAX_BUTTON_TITLE_LENGTH = 60;

/** Fetches the article title for a URL. Returns undefined on failure/timeout. */
export async function fetchLinkTitle(url: string): Promise<string | undefined> {
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), TITLE_FETCH_TIMEOUT_MS));
    try {
        const article = await Promise.race([extractArticle(url), timeout]);
        const title = article?.title?.trim();
        return title ? title.substring(0, MAX_TITLE_LENGTH) : undefined;
    } catch (err) {
        console.error(`failed to fetch title for ${url}: ${err}`);
        return undefined;
    }
}

export function linkDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/** Button label: "Title (domain)", or the raw URL when no title is stored. */
export function linkLabel(link: Link): string {
    if (!link.title) return link.link;
    const title = link.title.length > MAX_BUTTON_TITLE_LENGTH
        ? link.title.substring(0, MAX_BUTTON_TITLE_LENGTH - 1) + '…'
        : link.title;
    return `${title} (${linkDomain(link.link)})`;
}
