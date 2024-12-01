import { convert }  from 'html-to-text';
// There is also an alias to `convert` called `htmlToText`.

const MAX_LENGTH = 1000;

const options = {
  wordwrap: null,
  // ...
};

export function htmlToListOfParagraphs(html: string) {
  const text = convert(html, options);
  return fromTextToParagraphes(text);
}

export function fromTextToParagraphes(text: string) {
  const paragraphs = text.split('\n\n');
  const paragraphsClean = paragraphs.map(p => p.trim()).filter(p => p.length > 0);
  return paragraphsClean.flatMap(p => splitParagraphIfNeeded(p));
}

function divideTextIntoParagraphs(text: string): string[] {
  // Convert HTML to plain text
  // const text = htmlToText(htmlContent, {
  //   wordwrap: false,
  //   Add any other options you need
  // });

  const pars = text.split('\n\n');
  return pars.map(p => p.trim()).filter(p => p.length > 0);


  // Split the text into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  
  // Divide sentences into paragraphs of 5 sentences each
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 5) {
    const paragraph = sentences.slice(i, i + 5).join(' ').trim();
    paragraphs.push(paragraph);
  }

  console.log('number of paragraphes: ' + paragraphs.length);

  return paragraphs;
}

function splitParagraphIfNeeded(p: string): string[] {
  if (p.length <= MAX_LENGTH){
    return [p];
  } 

  return joinWords(p.split(' '), (MAX_LENGTH / 2 ) / 5);
}


function joinWords(words: string[], chunkSize: number): string[] {
  const result: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      result.push(chunk.join(" ")); // Join each chunk with a space
  }

  return result;
}

