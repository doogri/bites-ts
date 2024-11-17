import TelegramBot, { Message, WebHookOptions } from 'node-telegram-bot-api';
import { extractArticle } from './lib/crawl.js';
import { htmlToListOfParagraphs } from './lib/htmlToText.js';
import app from './lib/rest.js';
import { sleep } from './lib/utils.js';
import dotenv from 'dotenv';


dotenv.config({ 
    path: '.env'
});


try {
    await initTelegramBotManager();
    console.log('Bot is running');
} catch (error) {
    console.error('failed to init telegram bot. error: ' + error);    
}



const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

async function initTelegramBotManager() {
    const botToken = process.env["TELEGRAM_BOT_TOKEN"] || '';

    const who: WebHookOptions = {
        host: 'https://fair-pear-seal-kilt.cyclic.app',
        port: 443,
        key: 'new-messsage', // string | undefined;
    };

    const bot = new TelegramBot(botToken, { polling: true });//, { webHook: who });

    //await bot.setWebHook(`${who.host}/${who.key}`);

    bot.onText(/\/start/, (msg: Message, match) => {
        // 'msg' is the received Message from Telegram
        // 'match' is the result of executing the regexp above on the text content
        // of the message
        const chatId = msg.chat.id;

        if (!match) return;
        const resp = match[1]; // the captured "whatever"


        // send back the matched "whatever" to the chat
        bot.sendMessage(chatId, 'Wellcome! Paste here a link to an article you want to read.');
    });

    bot.on('error', (error) => {
        console.error('telegram bot error: ' + error);
    });

    bot.on('message', async (msg: Message) => {
        const chatId = msg.chat.id;
        console.log(JSON.stringify(msg));

        if (msg.from?.is_bot) {
            console.log(`message from bot. ignoring.`);
            return;
        }

        if (!msg.text) { // check also it's a url
            console.log(`going to send message to chatId: ${chatId} with text: no text. the text: ${msg.text}`);
            bot.sendMessage(chatId, 'no text');
            return;
        }
        bot.sendMessage(chatId, 'reading... better you get out now');

        const article = await extractArticle(msg.text!);
        await sendBackArticle(bot, chatId, article);
    });
}

// https://stackoverflow.com/a/76933672
function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#\+\-=|{}.!]/g, '\\$&'); 
}

async function sendBackArticle(bot: TelegramBot, chatId: number, article: void | { content?: string; title?: string; }){  
    if (!article || !article.content || !article.title) {
        bot.sendMessage(chatId, 'no response');
        return;
    }
    
    try {
        // https://core.telegram.org/bots/api#html-style
        const options: TelegramBot.SendMessageOptions = { parse_mode: 'MarkdownV2' };
        
        const titleEscaped = escapeMarkdown(article.title);
        const titleMsg = await bot.sendMessage(chatId, `*${titleEscaped}*`, options);
        await bot.pinChatMessage(chatId, titleMsg.message_id);
        
        const paragraphs = htmlToListOfParagraphs(article.content);
        for (const p of paragraphs) {
            await sleep(50);
            await bot.sendMessage(chatId, p);
        }
        
    } catch (error) {
        console.log(`failed to send messages to telegram: ${error}`);
        await bot.sendMessage(chatId, 'Error in sending back to Telegram. See logs');
    }       
}

