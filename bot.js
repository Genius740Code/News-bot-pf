require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path')
const parser = new Parser();
const express = require('express');
const app = express();
const port = process.env.PORT || 3002;

const Database = require('better-sqlite3');
const db = new Database('newsbot.db');


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});


//this is for hosting i use you can remove it

const http = require('./keep_alive.js');

const TOKEN = process.env.DISCORD_TOKEN;


//some news sources dont work 

const NEWS_SOURCES = {
    // UK Sources
    'BBC News': 'http://feeds.bbci.co.uk/news/world/rss.xml',
    'The Guardian': 'https://www.theguardian.com/world/rss',
    'Daily Mail': 'https://www.dailymail.co.uk/articles.rss',
    'Sky News': 'https://feeds.skynews.com/feeds/rss/world.xml',
    'Metro': 'https://metro.co.uk/feed/',
    'Mirror': 'https://www.mirror.co.uk/news/world-news/rss.xml',
    'Daily Record': 'https://www.dailyrecord.co.uk/news/rss.xml',
    
    // US Sources
    'NY Times': 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    //'CNN': 'http://rss.cnn.com/rss/edition_world.rss',
   // 'Fox News': 'http://feeds.foxnews.com/foxnews/world',
    'Washington Post': 'http://feeds.washingtonpost.com/rss/world',
    //'NPR': 'https://feeds.npr.org/1004/rss.xml',
    'Financial Times': 'https://www.ft.com/world?format=rss',
    'Bloomberg': 'https://feeds.bloomberg.com/markets/news.rss',
    'HuffPost': 'https://www.huffpost.com/section/world-news/feed',
    'ABC News': 'https://abcnews.go.com/abcnews/internationalheadlines',
    'ABC Australia': 'https://www.abc.net.au/news/feed/51120/rss.xml',
    //'The Sydney Morning Herald': 'https://www.smh.com.au/rss/feed.xml',
    'The Straits Times': 'https://www.straitstimes.com/news/asia/rss.xml',
    'South China Morning Post': 'https://www.scmp.com/rss/91/feed',
    'The Hindu': 'https://www.thehindu.com/news/national/feeder/default.rss',
    'Korea Times': 'https://www.koreatimes.co.kr/www/rss/rss.xml',
    'AllAfrica': 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    'Mail & Guardian (South Africa)': 'https://mg.co.za/section/africa/feed/',
    'Punch (Nigeria)': 'https://punchng.com/feed/',
    'Premium Times (Nigeria)': 'https://www.premiumtimesng.com/feed',
    'The Namibian': 'https://www.namibian.com.na/rss/',
   // 'TimesLIVE (South Africa)': 'https://www.timeslive.co.za/rss/?sectionId=2',
    //'Al Jazeera': 'https://www.aljazeera.com/xml/rss/all.xml',
    //'Deutsche Welle': 'https://rss.dw.com/xml/rss-en-world',
    'Cuteness': 'https://www.cuteness.com/rss'
};

let lastArticles = {};

//thekeywords

const KEYWORDS = {
    '🐾 Pets': ['pet','pets', 'dog', 'cat', 'veterinary', 'wildlife', 'endangered', 'zoo', 'exhibit'],
    '💀 Death': ['death', 'funeral', 'obituary', 'grave', 'cemetery', 'killed', 'dead', 'starved'],
    '🧠 Elon': ['elon', 'neurolink', 'tesla', 'x', 'twitter', 'spacex'],
    '🍆 Nsfw': ['porn','onlyfans', 'v-card', 'adult companys', 'adult content'],
    '⚽ Sports': ['sports', 'football', 'basketball', 'tennis', 'athlete'],
    '🧬 Science': ['science', 'research', 'experiment', 'discovery', 'innovation', 'space', 'alien'],
    '🧠 AI': ['ai', 'artificial intelligence', 'machine learning', 'neural network', 'deep learning', 'gpt'],
    '💰 Crypto': ['bitcoin', 'solona', 'crypto', 'blockchain', 'ethereum'],
    '🏛️ Politics': ['war', 'invade', 'politics', 'politician', 'goverment', 'president']
};

const CATEGORY_COLORS = {
    '🐾 Pets': 0x8B4513,    // Brown
    '💀 Death': 0x8B0000,   // Dark Red
    '🧠 Elon': 0x1DA1F2,    // Blue
    '🍆 Nsfw': 0x800080,     // Purple
    '⚽ Sports': 0x008000,   // Green
    '🧬 Science': 0x800080,  // Purple
    '🧠 AI': 0x000080,        // Navy Blue
    '💰 Crypto': 0xFFD700,    // Gold
    '🏛️ Politics': 0x4B0082    // Indigo
};

const POSTED_ARTICLES_FILE = 'posted_articles.json';

// cleanup config
const CONFIG = {
    CLEANUP_INTERVAL: 10 * 60 * 1000, 
    LOG_FILE: 'news_monitor.log',
    MAX_POSTED_ARTICLES: 100
};

// load previously posted articles
let postedArticles = {};
try {
    if (fs.existsSync(POSTED_ARTICLES_FILE)) {
        postedArticles = JSON.parse(fs.readFileSync(POSTED_ARTICLES_FILE, 'utf8'));
    }
} catch (error) {
    logToFile(`Error loading posted articles: ${error.message}`);
    postedArticles = {};
}

function savePostedArticles() {
    try {
        if (Object.keys(postedArticles).length > CONFIG.MAX_POSTED_ARTICLES) {
            const keys = Object.keys(postedArticles)
                .sort((a, b) => new Date(postedArticles[b].date) - new Date(postedArticles[a].date));
            
            // keep only the most recent articles
            const articlesToKeep = keys.slice(0, CONFIG.MAX_POSTED_ARTICLES);
            postedArticles = Object.fromEntries(
                articlesToKeep.map(key => [key, postedArticles[key]])
            );
        }

        const tempFile = `${POSTED_ARTICLES_FILE}.temp`;
        fs.writeFileSync(tempFile, JSON.stringify(postedArticles, null, 2));
        
        fs.renameSync(tempFile, POSTED_ARTICLES_FILE);
    } catch (error) {
        logToFile(`Error saving posted articles: ${error.message}`);
    }
}

function containsKeywords(text) {
    if (!text) return [];
    text = text.toLowerCase();
    
    const matchedCategories = [];
    for (const [category, keywords] of Object.entries(KEYWORDS)) {
        // Whole words only
        if (keywords.some(keyword => new RegExp(`\\b${keyword}\\b`).test(text))) {
            matchedCategories.push(category);
        }
    }
    return matchedCategories;
}

function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}\n`;
    
    try {
        fs.appendFileSync('news_monitor.log', logMessage);
        console.log(message);
    } catch (error) {
        console.error(`Failed to write to log file: ${error.message}`);
    }
    
    // Something for testing
    if (message.includes('Error')) {
        try {
            fs.appendFileSync('error_log.txt', logMessage + '\n');
        } catch (error) {
            console.error(`Failed to write to error log file: ${error.message}`);
        }
    }
}

async function postArticleToDiscord(article, source, categories, cleanDescription, thumbnailUrl) {
    const serverConfigs = db.prepare('SELECT * FROM server_configs').all();

    let imageUrl = thumbnailUrl;
    
    if (!imageUrl && article.content) {
        const patterns = [
            /<link rel="preload" href="([^"]+)" as="image"/,  // Metro pattern
            /srcset="([^"\s]+)"/,  // The Hindu pattern
            /<img[^>]+src="([^">]+)"/,  // Generic img tag
            /data-original="([^"]+)"/,   // Lazy loading images
        ];

        for (const pattern of patterns) {
            const match = article.content.match(pattern);
            if (match && match[1]) {
                imageUrl = match[1];
                break;
            }
        }
    }

    if (!imageUrl) {
        imageUrl = article.enclosure?.url ||
                  article['media:content']?.$.url ||
                  article['media:thumbnail']?.$.url ||
                  article.image?.url ||
                  article['media:group']?.['media:content']?.[0]?.$.url;
    }

    if (imageUrl) {
        imageUrl = imageUrl.split('?')[0];
        
        if (imageUrl.includes('i.dailymail.co.uk')) {
            imageUrl = imageUrl.replace(/-\w+\.jpg$/, '.jpg'); 
            imageUrl = imageUrl.replace(/\.jpg$/, '-a-2.5_ratio.jpg'); 
        }
        
        if (!imageUrl.startsWith('http')) {
            try {
                imageUrl = new URL(imageUrl, article.link).toString();
            } catch (error) {
                logToFile(`Error processing image URL: ${error.message}`);
                imageUrl = null;
            }
        }
    }

    const standardImage = imageUrl ? {
        url: imageUrl,
        width: 1920,
        height: 1080
    } : null;

    for (const config of serverConfigs) {
        const channel = client.channels.cache.get(config.channel_id);
        if (!channel) {
            logToFile(`Channel not found for server ${config.server_id}`);
            continue;
        }

        const allPings = [
            config.globalping_role_id ? `<@&${config.globalping_role_id}>` : '',
            ...categories.map(category => {
                const cleanCategory = category.replace(/[^\w\s]/g, '').toLowerCase().trim().replace(/\s+/g, '_');
                const roleIdKey = `${cleanCategory}_role_id`;
                return config[roleIdKey] ? `<@&${config[roleIdKey]}>` : '';
            })
        ].filter(Boolean).join(' ');

        try {
            await channel.send({
                embeds: [{
                    color: categories.length > 0 ? CATEGORY_COLORS[categories[0]] : 0x0099ff,
                    title: article.title,
                    url: article.link,
                    author: { name: source },
                    description: `${cleanDescription.substring(0, 250)}${cleanDescription.length > 250 ? '...' : ''}\n\n${categories.join(' | ')}\n\n${allPings}`,
                    fields: [
                        { name: '📰 Source', value: source, inline: true },
                        { name: '⏰ Published', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }// the bot is instant but i put the time like this instead of extracting because, some new sources dont have the time and timezone conversion but it is instant from my testing. It may glitch if you run it for the first time
                    ],
                    footer: { text: 'Made by Genius74o' }, // please dont remove this (unless you pay extra)
                    image: standardImage
                }]
            });
        } catch (error) {
            logToFile(`Error posting to server ${config.server_id}: ${error.message}`);
        }
    }
}

async function checkNewsFeeds() {
    const startTime = Date.now();
    logToFile('Checking news feeds...');
    let foundNewArticles = false;

    await Promise.all(Object.entries(NEWS_SOURCES).map(async ([source, url]) => {
        if (!url) return;

        try {
            const response = await fetch(url, { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/rss+xml,application/xml,*/*',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const feed = await parser.parseString(sanitizeXML(await response.text()));
            const latestArticle = feed.items[0];
            if (!latestArticle) return;

            const articleLink = latestArticle.link;
            if (postedArticles[articleLink]) return;

            const cleanTitle = (latestArticle.title || '').trim().replace(/\s+/g, ' ');
            const cleanDescription = (latestArticle.description || latestArticle.content || '')
                .replace(/<[^>]*>/g, '')
                .replace(/&quot;|&#x2018;|&#x2019;/g, "'")
                .trim();

            const allCategories = [...new Set([
                ...containsKeywords(latestArticle.title),
                ...containsKeywords(cleanDescription)
            ])];

            if (allCategories.length > 0) {
                foundNewArticles = true;
                postedArticles[articleLink] = {
                    title: cleanTitle,
                    date: new Date().toISOString(),
                    categories: allCategories,
                    source
                };

                const thumbnailUrl = latestArticle.enclosure?.url || 
                    latestArticle['media:content']?.url || 
                    latestArticle.content?.match(/<img[^>]+src="([^">]+)"/)?.[1];

                await postArticleToDiscord(latestArticle, source, allCategories, cleanDescription, thumbnailUrl);
                savePostedArticles();
            }
        } catch (error) {
            logToFile(`Error checking ${source}: ${error.message}`);
        }
    }));

    logToFile(`Completed news check in ${(Date.now() - startTime) / 1000} seconds${foundNewArticles ? '' : ' - No new articles found'}`);
}

function sanitizeXML(xml) {
    return xml
        .replace(/&(?!(amp|lt|gt|quot|apos|#\d+);)/g, '&amp;') 
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/[\uFFFE\uFFFF]/g, '');
}

// Cleanup
function cleanupOldArticles() {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const oldSize = Object.keys(postedArticles).length;
    
    for (const [link, data] of Object.entries(postedArticles)) {
        if (new Date(data.date) < tenDaysAgo) {
            delete postedArticles[link];
        }
    }

    const newSize = Object.keys(postedArticles).length;
    if (oldSize !== newSize) {
        savePostedArticles();
        logToFile(`Cleaned up ${oldSize - newSize} old articles from history`);
    }
}

// delete the log file
function deleteLogFile() {
    try {
        if (fs.existsSync(CONFIG.LOG_FILE)) {
            fs.unlinkSync(CONFIG.LOG_FILE);
            logToFile('Log file deleted successfully.');
        }
    } catch (error) {
        logToFile(`Error deleting log file: ${error.message}`);
    }
}

//  delete the error log file
function deleteErrorLogFile() {
    try {
        if (fs.existsSync('error_log.txt')) {
            fs.unlinkSync('error_log.txt');
            logToFile('Error log file deleted successfully.');
        }
    } catch (error) {
        logToFile(`Error deleting error log file: ${error.message}`);
    }
}

const { setupCommand } = require('./commands/setup.js');
const { resetCommand } = require('./commands/reset.js');

const commands = [
    setupCommand.data.toJSON(),
    resetCommand.data.toJSON()
];

client.once('ready', () => {
    logToFile(`Bot logged in as ${client.user.tag}`);
    
    // register the commands
    client.application.commands.set(commands)
        .then(() => console.log('Commands registered successfully!'))
        .catch(console.error);
    
    setInterval(cleanupOldArticles, CONFIG.CLEANUP_INTERVAL);
    setInterval(deleteLogFile, 10 * 60 * 1000); // Delete log file every 10 minutes
    setInterval(deleteErrorLogFile, 60 * 60 * 1000); // Delete error log file every hour
    
    checkNewsFeeds();

    //10sec
    setInterval(checkNewsFeeds, 10 * 1000);
});

client.on('error', error => {
    logToFile(`Client error occurred: ${error.message}`);
});

client.on('warn', warning => {
    logToFile(`Client warning: ${warning}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setup') {
        try {
            await setupCommand.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: 'There was an error executing this command!', 
                ephemeral: true 
            });
        }
    }
    if (interaction.commandName === 'reset') {
        try {
            await resetCommand.execute(interaction);
        } catch (error) {
            console.error(error);
        }
    }
});

app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

client.login(TOKEN);

process.on('SIGINT', () => {
    console.log('Closing database connection...');
    db.close();
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('Closing database connection...');
    db.close();
    process.exit();
});
