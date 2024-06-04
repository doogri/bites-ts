import OpenAI from 'openai';
import dotenv from 'dotenv';


dotenv.config({ 
    path: '.env'
});

const openai = new OpenAI({
 // api key defaults to process.env["OPENAI_API_KEY"]
  apiKey: process.env["OPENAI_API_KEY"]
});

export async function callGpt(prompt: string) {
  const completion = await openai.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    model: 'gpt-4',
  });

  console.log(completion.choices[0].message.content);
  return completion.choices[0].message.content;
}

