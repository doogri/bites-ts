import type TelegramBot from 'node-telegram-bot-api';
import validator from 'validator';
import { extractArticle } from './crawl.js';
import type { Link } from './db/entity/Link.js';

const TITLE_FETCH_TIMEOUT_MS = 10_000;
const MAX_TITLE_LENGTH = 500;

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

/** Full label: "Title (domain)", or the raw URL when no title is stored. */
export function linkLabel(link: Link): string {
    if (!link.title) return link.link;
    return `${link.title} (${linkDomain(link.link)})`;
}

const MAX_MESSAGE_LENGTH = 4000; // Telegram limit is 4096
const BUTTONS_PER_ROW = 5;

/**
 * Builds a link-selection message: full labels as a numbered list in the text
 * (Telegram buttons are single-line and get truncated), plus numbered buttons.
 * Links that don't fit in one message are left out and counted at the end.
 */
export function buildLinkListMessage(header: string, links: Link[]): { text: string, options: TelegramBot.SendMessageOptions } {
    const lines: string[] = [];
    const buttons: TelegramBot.InlineKeyboardButton[] = [];
    let length = header.length;

    for (const [i, link] of links.entries()) {
        const line = `${i + 1}. ${linkLabel(link)}`;
        if (length + line.length + 2 > MAX_MESSAGE_LENGTH - 30) break;
        lines.push(line);
        buttons.push({ text: String(i + 1), callback_data: link.id });
        length += line.length + 2;
    }

    const omitted = links.length - lines.length;
    if (omitted > 0) lines.push(`…and ${omitted} more`);

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
        keyboard.push(buttons.slice(i, i + BUTTONS_PER_ROW));
    }

    return {
        text: `${header}\n\n${lines.join('\n\n')}`,
        options: { reply_markup: { inline_keyboard: keyboard }, disable_web_page_preview: true },
    };
}

const MAX_SAVE_BUTTONS = 5;
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico)$/i;
const URL_RE = /https?:\/\/[^\s\[\]<>"']+/g;

/**
 * Extracts saveable URLs from a message text, in order of appearance.
 * Skips images (Telegram previews them; no need to store) and duplicates.
 * Deterministic, so a callback can re-run it on the message text and pick by index.
 */
export function extractUrls(text: string): string[] {
    const urls: string[] = [];
    for (const match of text.matchAll(URL_RE)) {
        const url = match[0].replace(/[.,;:!?)]+$/, '');
        if (urls.includes(url)) continue;
        if (!validator.isURL(url, { protocols: ['http', 'https'], require_protocol: true })) continue;
        try {
            if (IMAGE_EXT_RE.test(new URL(url).pathname)) continue;
        } catch {
            continue;
        }
        urls.push(url);
        if (urls.length >= MAX_SAVE_BUTTONS) break;
    }
    return urls;
}

export const SAVE_LINK_PREFIX = 'save:';

/** Inline keyboard with one "save" button per URL (one per row), or undefined if none. */
export function buildSaveLinksKeyboard(urls: string[]): TelegramBot.InlineKeyboardMarkup | undefined {
    if (urls.length === 0) return undefined;
    return {
        inline_keyboard: urls.map((url, i) => [{ text: `💾 ${linkDomain(url)}`, callback_data: `${SAVE_LINK_PREFIX}${i}` }]),
    };
}
