const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Database = require('better-sqlite3');
const db = new Database('newsbot.db');

// I made these commands as I didnt know if you wanted to buy the bot or the code, so ye


const CATEGORY_ROLES = {
    '🔔 Global Ping': { color: 0x7289DA }, 
    '🐾 Pets': { color: 0x8B4513 },
    '💀 Death': { color: 0x8B0000 },
    '🧠 Elon': { color: 0x1DA1F2 },
    '🍆 Nsfw': { color: 0x800080 },
    '⚽ Sports': { color: 0x008000 },
    '🧬 Science': { color: 0x800080 },
    '🧠 AI': { color: 0x000080 },
    '💰 Crypto': { color: 0xFFD700 },
    '🏛️ Politics': { color: 0x4B0082 }
};

// Create the table 
db.exec(`
    CREATE TABLE IF NOT EXISTS server_configs (
        server_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        pets_role_id TEXT,
        death_role_id TEXT,
        elon_role_id TEXT,
        nsfw_role_id TEXT,
        sports_role_id TEXT,
        science_role_id TEXT,
        ai_role_id TEXT,
        crypto_role_id TEXT,
        politics_role_id TEXT,
        globalping_role_id TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

const setupCommand = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Sets up news tracker configuration')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Select the news tracker channel')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                embeds: [{
                    title: '❌ Permission Denied',
                    description: 'You need Administrator permissions to use this command.', //saftey teasons
                    color: 0xFF0000,
                    timestamp: new Date()
                }],
                ephemeral: true
            });
        }

        try {
            // Check if server is already configured
            const existingConfig = db.prepare('SELECT * FROM server_configs WHERE server_id = ?').get(interaction.guild.id);
            
            if (existingConfig) {
                return await interaction.reply({
                    embeds: [{
                        title: '❌ Already Configured',
                        description: 'This server is already configured. Use `/reset` first if you want to reconfigure.',
                        color: 0xFF0000,
                        timestamp: new Date()
                    }]
                });
            }

            await interaction.deferReply();

            // Batch create roles more efficiently
            const roles = await Promise.all(
                Object.entries(CATEGORY_ROLES).map(([name, settings]) =>
                    interaction.guild.roles.create({
                        name,
                        color: settings.color,
                        permissions: [],
                        reason: 'News category role'
                    }).catch(() => null)
                )
            );

            const roleIds = Object.fromEntries(
                roles.filter(Boolean).map((role, i) => [
                    Object.keys(CATEGORY_ROLES)[i] === '🔔 Global Ping' 
                        ? 'globalping_role_id' 
                        : `${Object.keys(CATEGORY_ROLES)[i].toLowerCase().replace(/[^a-z]/g, '').replace(/\s+/g, '_')}_role_id`,
                    role.id
                ])
            );

            const channel = interaction.options.getChannel('channel');

            const columns = ['server_id', 'channel_id', ...Object.keys(roleIds), 'updated_at'];
            const placeholders = Array(columns.length).fill('?').join(',');
            
            db.prepare(`
                INSERT INTO server_configs 
                (${columns.join(',')}) 
                VALUES (${placeholders})
            `).run(
                interaction.guild.id,
                channel.id,
                ...Object.values(roleIds),
                new Date().toISOString()
            );

            const rolesList = Object.entries(CATEGORY_ROLES)
                .map(([name, _]) => {
                    const keyName = name === '🐾 Global Ping' ? 'globalping_role_id' :
                        name.toLowerCase().replace(/[^a-z]/g, '').replace(/\s+/g, '_') + '_role_id';
                    return `${name}: <@&${roleIds[keyName]}>`;
                })
                .join('\n');

            await interaction.editReply({
                embeds: [{
                    title: '✅ Setup Complete',
                    description: 'News tracker has been configured successfully!',
                    fields: [
                        {
                            name: '📝 Channel',
                            value: `${channel}`,
                            inline: false
                        },
                        {
                            name: '🎭 Created Roles',
                            value: rolesList,
                            inline: false
                        }
                    ],
                    color: 0x00FF00,
                    timestamp: new Date(),
                    footer: {
                        text: `Server ID: ${interaction.guild.id}`
                    }
                }]
            });

        } catch (error) {
            console.error('Setup error:', error);
            const errorMessage = {
                embeds: [{
                    title: '❌ Setup Error',
                    description: `${error.message}\nPlease make sure I have the correct permissions and try again.`,
                    color: 0xFF0000,
                    timestamp: new Date()
                }]
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else {
                await interaction.reply({ ...errorMessage, ephemeral: true });
            }
        }
    }
};

module.exports = { setupCommand }; 