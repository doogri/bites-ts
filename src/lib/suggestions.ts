import { buildLinkListMessage } from './linkTitle.js';
import TelegramBot from "node-telegram-bot-api";
import { AppDataSource } from "./data-source.js";
import { Link } from "./db/entity/Link.js";
import { User } from "./db/entity/User.js";


export async function sendSuggestions(bot: TelegramBot, chatId: number,  userTelegram: TelegramBot.User){
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
        where: { telegramId: userTelegram.id },
    });
    if (!user) {
       // bot.sendMessage(chatId, 'I cannot know you. bye');
        return;
    }

    const linkRepository = AppDataSource.getRepository(Link);
    const links = await linkRepository.find({
        where: { userId : user.id, sent: false },
        order: {
            createdAt: 'ASC',  // oldest first
          },
          take: 10,
    });

    if (links.length === 0){
        return;
    }

    const { text, options } = buildLinkListMessage('Please select an option:', links);
        bot.sendMessage(chatId, text, options);
}