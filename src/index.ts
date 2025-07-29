import TelegramBot, { CallbackQuery, Message, WebHookOptions } from 'node-telegram-bot-api';
import { extractArticle } from './lib/crawl.js';
import { fromTextToParagraphes, htmlToListOfParagraphs } from './lib/htmlToText.js';
import app from './lib/rest.js';
import { sleep } from './lib/utils.js';
import dotenv from 'dotenv';
import { extractFromPdf } from './lib/pdfExtractor.js';
import { AppDataSource } from './lib/data-source.js';
import * as linksBot from './lib/linksBot.js';
import { sendSuggestions } from './lib/suggestions.js';
import { Link } from './lib/db/entity/Link.js';
import { User } from './lib/db/entity/User.js';


dotenv.config({ 
    path: '.env'
});


AppDataSource.initialize()
    .then(() => {
        console.log('Data Source has been initialized!');
        
    })
    .catch((err) => {
        console.error('Error during Data Source initialization', err);
    });

try {
    await initTelegramBotManager();
    await linksBot.initTelegramBotManager()
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

    bot.onText(/\/list/, async (msg: Message) => {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        
        if (!userId) {
            bot.sendMessage(chatId, 'I cannot know you. bye');
            return;
        }

        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { telegramId: userId },
        });
        
        if (!user) {
            bot.sendMessage(chatId, 'I cannot know you. bye');
            return;
        }

        const linkRepository = AppDataSource.getRepository(Link);
        const unreadLinks = await linkRepository.find({
            where: { userId: user.id, sent: false },
            order: { createdAt: 'ASC' },
        });

        if (unreadLinks.length === 0) {
            bot.sendMessage(chatId, 'No unread links found.');
            return;
        }

        const keyboards = unreadLinks.map((link: Link) => [{text: link.link, callback_data: link.id}]);

        const options: TelegramBot.SendMessageOptions = {
            reply_markup: {
              inline_keyboard: [...keyboards]
            }
          };
        
        bot.sendMessage(chatId, 'Unread links:', options);
    });

    bot.on('error', (error) => {
        console.error('telegram bot error: ' + error);
    });

    bot.on('message', async (msg: Message) => {
        const chatId = msg.chat.id;
        console.log(JSON.stringify(msg));

        const user = msg.from;

        if (msg.from?.is_bot) {
            console.log(`message from bot. ignoring.`);          
            return;
        }

        if (!msg.text && !msg.document) { // check also it's a url
            console.log(`going to send message to chatId: ${chatId} with text: no text. the text: ${msg.text}`);
            bot.sendMessage(chatId, 'no text');
            return;
        }

        bot.sendMessage(chatId, 'reading... better you get out now');
        
        if (msg.document) {
            const text = await extractFromPdf(msg, bot, botToken);
            const paragraphes = fromTextToParagraphes(text);
            await sendBack('tmp title', paragraphes, bot, chatId);
        }
        else {
            const article = await extractArticle(msg.text!);
            await sendBackArticle(bot, chatId, article);
            if (user) {
                await sendSuggestions(bot, chatId, user);
            }
        }
    });

    bot.on('callback_query', async (callbackQuery: CallbackQuery) => {
        const message = callbackQuery.message;
        const data = callbackQuery.data;
        const user = callbackQuery.from;
      
        if (!message || !data){
            return;
        }

        bot.sendMessage(message.chat.id, 'reading... better you get out now');

             
        const linkRepository = AppDataSource.getRepository(Link);
        const linkRecord = await linkRepository.findOneBy({ id: data });
        if (!linkRecord){
            return;
        }
        const link = linkRecord.link;
        console.log('the link: ' + link);
        
        const article = await extractArticle(link);
        await sendBackArticle(bot, message.chat.id, article);
        
        linkRecord.sent = true;
        await linkRepository.save(linkRecord);

        if (user) {
            await sendSuggestions(bot, message.chat.id, user);
        }

        //bot.sendMessage(message.chat.id, `You selected: ${data}`);
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
        const title = article.title;
        const paragraphs = htmlToListOfParagraphs(article.content);
        await sendBack(title, paragraphs, bot, chatId);
       
        
    } catch (error) {
        console.log(`failed to prepare messages to telegram: ${error}`);
        await bot.sendMessage(chatId, 'Error in prepare messages to Telegram. See logs');
    }
}

async function sendBack(title: string, paragraphs: string[], bot: TelegramBot, chatId: number) {
    try {
        // https://core.telegram.org/bots/api#html-style
        const options: TelegramBot.SendMessageOptions = { parse_mode: 'MarkdownV2' };
        const titleEscaped = escapeMarkdown(title);
        const titleMsg = await bot.sendMessage(chatId, `*${titleEscaped}*`, options);
        await bot.pinChatMessage(chatId, titleMsg.message_id);

        console.log(`going to send ${paragraphs.length} paragraphs`);
        await sleep(50);
        for (const p of paragraphs) {
            await sleep(1);
            console.log(`length of paragrph to send: ${p.length}`);
            await bot.sendMessage(chatId, p);
        }
    } catch (error) {
        console.log(`failed to send messages to telegram: ${error}`);
        await bot.sendMessage(chatId, 'Error in sending back to Telegram. See logs');
    }
}