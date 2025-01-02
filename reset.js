const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
const db = new Database('newsbot.db');

//It may look like the command is broken but it works

const resetCommand = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Resets all news tracker configuration')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Add explicit permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                embeds: [{
                    title: '❌ Permission Denied',
                    description: 'You need Administrator permissions to use this command.',
                    color: 0xFF0000,
                    timestamp: new Date()
                }],
                ephemeral: true
            });
        }

        const serverConfig = db.prepare('SELECT * FROM server_configs WHERE server_id = ?').get(interaction.guild.id);

        if (!serverConfig) {
            return await interaction.reply({
                embeds: [{
                    title: '❌ Not Configured',
                    description: 'This server has not been set up yet. Use `/setup` to configure the news tracker.',
                    color: 0xFF0000,
                    timestamp: new Date()
                }],
                ephemeral: true
            });
        }

        // Create confirmation buttons
        const confirm = new ButtonBuilder()
            .setCustomId('confirm_reset')
            .setLabel('Yes, Reset Everything')
            .setStyle(ButtonStyle.Danger);

        const cancel = new ButtonBuilder()
            .setCustomId('cancel_reset')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(cancel, confirm);

        // Send confirmation message
        const response = await interaction.reply({
            embeds: [{
                title: '⚠️ Confirm Reset',
                description: 'Are you sure you want to reset the news tracker?\n\nThis will:\n' +
                    '• Delete all news tracker roles (if possible)\n' +
                    '• Remove all configuration from the database\n' +
                    '• Require running `/setup` again to reconfigure\n' +
                    '• Please Wait this may glitch but it will work',
                color: 0xFFA500,
                timestamp: new Date()
            }],
            components: [row],
            ephemeral: true
        });

        // Create collector for button interaction
        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async i => {
            if (i.customId === 'confirm_reset') {
                try {
                    // Simplified role deletion
                    const roleIds = Object.values(serverConfig).filter(id => 
                        typeof id === 'string' && 
                        id !== serverConfig.server_id && 
                        id !== serverConfig.channel_id
                    );

                    await Promise.all(roleIds.map(async roleId => {
                        try {
                            const role = await interaction.guild.roles.fetch(roleId);
                            if (role) await role.delete();
                        } catch {
                            // Ignore individual role deletion errors
                        }
                    }));

                    // Remove from database
                    db.prepare('DELETE FROM server_configs WHERE server_id = ?').run(interaction.guild.id);

                    await i.update({
                        embeds: [{
                            title: '✅ Reset Complete',
                            description: 'Configuration has been reset. Some roles may need to be deleted manually if the bot lacks permissions.\n\nUse `/setup` to configure again.',
                            color: 0x00FF00,
                            timestamp: new Date()
                        }],
                        components: []
                    }).catch(() => {
                        // If update fails, try to send a new reply
                        interaction.followUp({
                            embeds: [{
                                title: '✅ Reset Complete',
                                description: 'Configuration has been reset. Some roles may need to be deleted manually if the bot lacks permissions.\n\nUse `/setup` to configure again.',
                                color: 0x00FF00,
                                timestamp: new Date()
                            }],
                            ephemeral: true
                        }).catch(() => {});
                    });
                } catch (error) {
                    console.error('Reset error:', error);
                    try {
                        await i.update({
                            embeds: [{
                                title: '⚠️ Partial Reset',
                                description: 'Database configuration has been reset, but some roles may need to be deleted manually.\n\nUse `/setup` to configure again.',
                                color: 0xFFA500,
                                timestamp: new Date()
                            }],
                            components: []
                        });
                    } catch {
                        // If update fails, try to send a new reply
                        interaction.followUp({
                            embeds: [{
                                title: '⚠️ Partial Reset',
                                description: 'Database configuration has been reset, but some roles may need to be deleted manually.\n\nUse `/setup` to configure again.',
                                color: 0xFFA500,
                                timestamp: new Date()
                            }],
                            ephemeral: true
                        }).catch(() => {});
                    }
                }
            } else if (i.customId === 'cancel_reset') {
                try {
                    await i.update({
                        embeds: [{
                            title: '↩️ Reset Cancelled',
                            description: 'Reset operation has been cancelled.',
                            color: 0x808080,
                            timestamp: new Date()
                        }],
                        components: []
                    });
                } catch {
                    // If update fails, try to send a new reply
                    interaction.followUp({
                        embeds: [{
                            title: '↩️ Reset Cancelled',
                            description: 'Reset operation has been cancelled.',
                            color: 0x808080,
                            timestamp: new Date()
                        }],
                        ephemeral: true
                    }).catch(() => {});
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                try {
                    await interaction.editReply({
                        embeds: [{
                            title: '⏱️ Timed Out',
                            description: 'Reset confirmation timed out. Please try again.',
                            color: 0x808080,
                            timestamp: new Date()
                        }],
                        components: []
                    });
                } catch {
                    // Ignore any errors here as the interaction might be invalid
                }
            }
        });
    }
};

module.exports = { resetCommand };
