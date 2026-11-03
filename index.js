
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const PREFIX = "?";
const SUZERAIN_ID = "1382832095394529361";

client.once("ready", () => {
  console.log(`Puppet is online as ${client.user.tag}`);
  console.log("Ready to serve.");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.trim().toLowerCase();

  const isMemberCommand =
    content === `${PREFIX}membercount` ||
    content === "puppet. how many members." ||
    content === "puppet how many members";

  if (!isMemberCommand) return;

  const memberCount = message.guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor("#8B5CF6")
    .setAuthor({
      name: "Puppet • Server Statistics",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle("✦ The Kingdom's Population")
    .setDescription(
      `Greetings, **${message.guild.name}**.\n\n` +
      `The kingdom currently holds **${memberCount.toLocaleString()} members**.`
    )
    .addFields(
      {
        name: "👥 Total Members",
        value: `\`${memberCount.toLocaleString()}\``,
        inline: true
      },
      {
        name: "👑 Requested By",
        value: `${message.author}`,
        inline: true
      }
    )
    .setThumbnail(message.guild.iconURL({ size: 256 }))
    .setFooter({
      text: "Puppet • At your service"
    })
    .setTimestamp();

  await message.reply({
    embeds: [embed]
  });

  // Special response for the Suzerain
  if (message.author.id === SUZERAIN_ID) {
    await message.channel.send("my suzerain");
  }
});

client.login(process.env.DISCORD_TOKEN);
