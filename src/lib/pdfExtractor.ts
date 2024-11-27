import TelegramBot, { Message } from "node-telegram-bot-api";
import PdfParse from "pdf-parse"

export async function extractFromPdf(msg: Message, bot: TelegramBot, botToken: string): Promise<string>{
    if (!msg.document){
        throw new Error('should not be here');
    }

    const fileId = msg.document.file_id;

    try {
        // Get the file link
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;

        // Download the file
        const fileBuffer = await fetch(fileUrl).then(res => res.arrayBuffer());

        // Extract text from the PDF
        const pdfData = await PdfParse(Buffer.from(fileBuffer));
        const extractedText = pdfData.text;
        if (!extractedText){
            return 'No text found';
        }

        const savedMultiLine = extractedText.replace(/\n\n/g, '^&*');
        const textWithoutNewLines = savedMultiLine.replace(/\n/g, ' ');
        const textWithoutSingleNewLines = textWithoutNewLines.replace('^&*', '\n\n');
        

        return textWithoutSingleNewLines;
    } catch (error) {
        console.error('Error processing PDF:', error);
        //await bot.sendMessage(chatId, 'Failed to process the PDF. Please try again.');
        return 'Failed to process the PDF';
    }
}