import TelegramBot, { Message } from 'node-telegram-bot-api';
import { extractArticle } from './lib/crawl.js';
import { htmlToListOfParagraphs } from './lib/htmlToText.js';
import app from './lib/rest.js';



// replace the value below with the Telegram token you receive from @BotFather
const botToken = process.env["TELEGRAM_BOT_TOKEN"] || '';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(botToken, { polling: true });

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

bot.on('message', (msg: Message) => {
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


    extractArticle(msg.text!).then(async (res) => {
        if (!res || !res.content || !res.title) {
            bot.sendMessage(chatId, 'no response');
            return;
        }

        // https://core.telegram.org/bots/api#html-style
        const titleMsg = await bot.sendMessage(chatId, `*${res.title}*`, { parse_mode: 'MarkdownV2' });
        await bot.pinChatMessage(chatId, titleMsg.message_id);
        
        const paragraphs = htmlToListOfParagraphs(res.content);
        for (const p of paragraphs) {
            await bot.sendMessage(chatId, p);
        }
    });
});


console.log('Bot is running');

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });