import TelegramBot, { Message, WebHookOptions } from "node-telegram-bot-api";
import { User } from "./db/entity/User.js";
import { AppDataSource } from "./data-source.js";
import { Link } from "./db/entity/Link.js";

export async function initTelegramBotManager() {
    const botToken = process.env["TELEGRAM_LINKS_BOT_TOKEN"] || '';
    const bot = new TelegramBot(botToken, { polling: true });//, { webHook: who });
    bot.onText(/\/start/, async (msg: Message, match) => {
        const chatId = msg.chat.id;

        if (!match) return;
        const resp = match[1]; // the captured "whatever"
        const userId = msg.from?.id;
        if (!userId){
            bot.sendMessage(chatId, 'I cannot know you. bye');
            return;
        }

        const user = new User();
        user.firstName = msg.from?.first_name ?? '';
        user.lastName =  msg.from?.last_name ?? '';
        user.telegramId = userId;

        const userRepository = AppDataSource.getRepository(User);
        if (await userRepository.exists({ where: { telegramId: userId } })) {
            console.log('user already exist');
            await bot.sendMessage(chatId, 'Wellcome! Paste here a link to an article you want to read.');            
            return;
        }

        const savedUser = await userRepository.save(user);
        console.log('User saved:', savedUser);

        await bot.sendMessage(chatId, 'Wellcome! Paste here a link to an article you want to read.');
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

        if (!msg.text && !msg.document) { // check also it's a url
            console.log(`going to send message to chatId: ${chatId} with text: no text. the text: ${msg.text}`);
            bot.sendMessage(chatId, 'no text');
            return;
        }

        const userId = msg.from?.id;
        if (!userId){
            bot.sendMessage(chatId, 'I cannot know you. bye');
            return;
        }
        if (!msg.text){
            bot.sendMessage(chatId, 'No link, bro');
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
        
        const link = new Link();
        link.link = msg.text;
        link.userId = user.id;

        const linkRepository = AppDataSource.getRepository(Link);
        // todo - if user already exist - just say hi
        const savedLink = await linkRepository.save(link);



        bot.sendMessage(chatId, 'link was stored successfully');
    });
}