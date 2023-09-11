import { convert }  from 'html-to-text';
// There is also an alias to `convert` called `htmlToText`.

const options = {
  wordwrap: 130,
  // ...
};

export function htmlToListOfParagraphs(html: string) {
    const text = convert(html, options);
    const paragraphs = text.split('\n');
    return paragraphs.map(p => p.trim()).filter(p => p.length > 0);
}
