import Crawler, { CrawlerRequestResponse } from 'crawler';
import { extract } from '@extractus/article-extractor'
//const extract = import('@extractus/article-extractor/index');


function crawl(link: string) {
    const c = new Crawler({
        maxConnections: 10,
        // This will be called for each crawled page
        callback: (error, res: CrawlerRequestResponse, done) => {
            if (error) {
                console.log(error);
            } else {
                const $ = res.$;
                // $ is Cheerio by default
                //a lean implementation of core jQuery designed specifically for the server
                console.log($('title').text());
                //console.log(res.body);
            }
            done();
        }
    });
    //c.queue('http://www.amazon.com');
    c.queue('https://blog.medium.com/what-were-reading-when-you-talk-about-ai-context-matters-73aa894ee8bb');

}

//crawl('http://www.amazon.com');


export async function extractArticle(input: string): Promise<{ content?: string, title?: string }|void> {
    //const extract = await import('@extractus/article-extractor');
    //await extract.extract
    // import('@extractus/article-extractor').then(async ({ extract }) => {
    //   // use the extract function here
    // }).catch((err) => {
    //   console.error(err);
    // });



    try {
        const article = await extract(input);
        //console.log(`article after extraction: ${JSON.stringify(article)} `);
        return  { content: article?.content, title: article?.title };
    } catch (err) {
        console.error(`failed to extract article. error: ${err}`);
    }

}

//const input = 'https://www.cnbc.com/2022/09/21/what-another-major-rate-hike-by-the-federal-reserve-means-to-you.html'
//const input = 'https://blog.medium.com/what-were-reading-when-you-talk-about-ai-context-matters-73aa894ee8bb';
//extractArticle(input);