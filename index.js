
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const SUZERAIN_ID = "1382832095394529361";
const PREFIX = "?";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "puppet-data.json");

const COLORS = {
  main: "#8B5CF6",
  friendly: "#2563EB",
  success: "#22C55E",
  error: "#EF4444"
};

const FRIENDLY_POSITIONS = {
  "8v8": ["ST", "ST", "LM", "RM", "LB", "CB", "RB", "GK"],
  "9v9": ["ST", "ST", "LM", "CM", "RM", "LB", "CB", "RB", "GK"]
};

let data = {
  countries: {},
  friendlies: {}
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

      data = {
        countries: saved.countries || {},
        friendlies: saved.friendlies || {}
      };
    }
  } catch (error) {
    console.error("Data loading error:", error);
  }
}

function saveData() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

    const tempFile = DATA_FILE + ".tmp";

    fs.writeFileSync(
      tempFile,
      JSON.stringify(data, null, 2)
    );

    fs.renameSync(tempFile, DATA_FILE);
  } catch (error) {
    console.error("Data saving error:", error);
  }
}

function getCountryCode(userId) {
  return data.countries[userId] || null;
}

function getCountryName(code) {
  try {
    return new Intl.DisplayNames(["en"], {
      type: "region"
    }).of(code);
  } catch {
    return code;
  }
}

function getFlag(code) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return "🏳️";

  return String.fromCodePoint(
    ...[...code].map(char => 127397 + char.charCodeAt(0))
  );
}

function getPlayerLabel(userId, position) {
  const country = getCountryCode(userId);
  const flag = country ? getFlag(country) : "🏳️";

  return `${flag} **${position}** — <@${userId}>`;
}

function extractMentions(input) {
  return [...input.matchAll(/<@!?(\d+)>/g)].map(match => match[1]);
}

function parseCustomPlayers(input) {
  const parts = input
    .split(/[\n,;]+/)
    .map(part => part.trim())
    .filter(Boolean);

  const players = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    const match = part.match(
      /^([A-Za-z0-9+/-]{1,10})\s*[:=-]\s*<@!?(\d+)>\s*$/
    );

    if (match) {
      players.push({
        position: match[1].toUpperCase(),
        userId: match[2]
      });

      continue;
    }

    const mentions = extractMentions(part);

    if (mentions.length !== 1) {
      throw new Error(
        `Invalid player entry: ${part}. Use POSITION: @player`
      );
    }

    players.push({
      position: `P${i + 1}`,
      userId: mentions[0]
    });
  }

  const ids = players.map(player => player.userId);

  if (new Set(ids).size !== ids.length) {
    throw new Error("You cannot put the same player in the lineup twice.");
  }

  return players;
}

function parseFriendlyPlayers(input, positions) {
  const ids = extractMentions(input);

  if (ids.length !== positions.length) {
    throw new Error(
      `This formation requires exactly ${positions.length} players. You supplied ${ids.length}.`
    );
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error("You cannot put the same player in the lineup twice.");
  }

  return positions.map((position, index) => ({
    position,
    userId: ids[index]
  }));
}

async function validatePlayers(guild, ids) {
  const uniqueIds = [...new Set(ids)];

  const members = await Promise.all(
    uniqueIds.map(id =>
      guild.members.fetch(id).catch(() => null)
    )
  );

  const missing = uniqueIds.filter((id, index) => !members[index]);

  if (missing.length) {
    throw new Error(
      `These users are not members of this server: ${missing.map(id => `<@${id}>`).join(", ")}`
    );
  }

  return members;
}

function getMentions(players) {
  return players.map(player => `<@${player.userId}>`).join(" ");
}

function createLineupEmbed(formation, players, bench) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.main)
    .setAuthor({
      name: "PUPPET • LINEUP GENERATOR",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`✦ ${formation} Formation`)
    .setDescription(
      players.map(player =>
        getPlayerLabel(player.userId, player.position)
      ).join("\n")
    )
    .addFields({
      name: "FORMATION",
      value: `\`${formation}\``,
      inline: true
    }, {
      name: "STARTING PLAYERS",
      value: `\`${players.length}\``,
      inline: true
    })
    .setURL("https://www.buildlineup.com/")
    .setFooter({
      text: "Puppet • BuildLineup squad generator"
    })
    .setTimestamp();

  if (bench.length) {
    embed.addFields({
      name: "SUBSTITUTES",
      value: bench.map((id, index) =>
        getPlayerLabel(id, `SUB ${index + 1}`)
      ).join("\n")
    });
  }

  embed.addFields({
    name: "BUILD YOUR VISUAL LINEUP",
    value: "[Open BuildLineup](https://www.buildlineup.com/) • Recreate your formation using the listed players."
  });

  return embed;
}

function createFriendlyEmbed(friendly, guild) {
  const positions = FRIENDLY_POSITIONS[friendly.format];

  const embed = new EmbedBuilder()
    .setColor(COLORS.friendly)
    .setAuthor({
      name: "PUPPET • FRIENDLY MANAGER",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`✦ ${friendly.format} Friendly Lineup`)
    .setDescription(
      friendly.players.map(player =>
        getPlayerLabel(player.userId, player.position)
      ).join("\n")
    )
    .addFields(
      {
        name: "FORMATION",
        value: `\`${friendly.format === "8v8" ? "2-2-3" : "2-3-3"}\``,
        inline: true
      },
      {
        name: "PLAYERS",
        value: `\`${friendly.players.length}/${positions.length}\``,
        inline: true
      }
    );

  if (friendly.bench.length) {
    embed.addFields({
      name: `BENCH • ${friendly.bench.length}`,
      value: friendly.bench.map((id, index) =>
        getPlayerLabel(id, `SUB ${index + 1}`)
      ).join("\n")
    });
  } else {
    embed.addFields({
      name: "BENCH",
      value: "No substitutes registered."
    });
  }

  embed.addFields({
    name: "SUBSTITUTIONS",
    value: "Use `/sub` to replace a player. The outgoing player automatically moves to the bench."
  });

  embed.setFooter({
    text: `${guild.name} • Puppet Friendly Manager`
  });

  embed.setTimestamp();

  return embed;
}

async function sendFriendly(interaction, friendly) {
  const embed = createFriendlyEmbed(
    friendly,
    interaction.guild
  );

  await interaction.reply({
    content: `**STARTING LINEUP**\n${getMentions(friendly.players)}`,
    embeds: [embed],
    allowedMentions: {
      users: friendly.players.map(player => player.userId)
    }
  });
}

const commands = [
  new SlashCommandBuilder()
    .setName("lineup")
    .setDescription("Create and manage football lineups")

    .addSubcommand(sub =>
      sub
        .setName("create")
        .setDescription("Generate a custom football lineup")
        .addStringOption(option =>
          option
            .setName("formation")
            .setDescription("Any formation, e.g. 4-3-3, 3-2-2")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("players")
            .setDescription("POSITION: @player, POSITION: @player")
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName("bench")
            .setDescription("Optional substitute mentions separated by commas")
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("setcountry")
        .setDescription("Register your country")
        .addStringOption(option =>
          option
            .setName("country")
            .setDescription("Two-letter country code, e.g. PL, FR, MA, ZA")
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub
        .setName("mycountry")
        .setDescription("Check a registered country")
        .addUserOption(option =>
          option
            .setName("player")
            .setDescription("Player to check (optional)")
        )
    ),

  new SlashCommandBuilder()
    .setName("friendly")
    .setDescription("Create an 8v8 or 9v9 friendly lineup")
    .addStringOption(option =>
      option
        .setName("format")
        .setDescription("Choose the match format")
        .setRequired(true)
        .addChoices(
          { name: "8v8", value: "8v8" },
          { name: "9v9", value: "9v9" }
        )
    )
    .addStringOption(option =>
      option
        .setName("players")
        .setDescription("Mention players in positional order, separated by commas")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("bench")
        .setDescription("Optional substitute mentions separated by commas")
    ),

  new SlashCommandBuilder()
    .setName("sub")
    .setDescription("Substitute a player in the active friendly lineup")
    .addUserOption(option =>
      option
        .setName("outgoing")
        .setDescription("Player leaving the pitch")
        .setRequired(true)
    )
    .addUserOption(option =>
      option
        .setName("incoming")
        .setDescription("Player entering the pitch")
        .setRequired(true)
    )
];

client.once("ready", async () => {
  console.log(`Puppet is online as ${client.user.tag}`);
  console.log("Ready to serve.");

  loadData();

  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands.map(command => command.toJSON())
      }
    );

    console.log("Puppet slash commands registered.");
  } catch (error) {
    console.error("Command registration error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  try {
    // LINEUP COMMANDS

    if (interaction.commandName === "lineup") {
      const action = interaction.options.getSubcommand();

      if (action === "setcountry") {
        const code = interaction.options
          .getString("country")
          .trim()
          .toUpperCase();

        if (!/^[A-Z]{2}$/.test(code)) {
          return interaction.reply({
            content: "Please provide a valid two-letter country code, such as PL or FR.",
            ephemeral: true
          });
        }

        const countryName = getCountryName(code);

        if (
          !countryName ||
          countryName === code ||
          countryName === "Unknown Region"
        ) {
          return interaction.reply({
            content: "That country code could not be recognised.",
            ephemeral: true
          });
        }

        data.countries[interaction.user.id] = code;
        saveData();

        return interaction.reply({
          content: `${getFlag(code)} Your country has been registered as **${countryName}**.`,
          ephemeral: true
        });
      }

      if (action === "mycountry") {
        const target = interaction.options.getUser("player") || interaction.user;
        const code = getCountryCode(target.id);

        if (!code) {
          return interaction.reply({
            content: `${target} has not registered a country yet. Use \`/lineup setcountry\`.`,
            ephemeral: true
          });
        }

        return interaction.reply({
          content: `${getFlag(code)} **${target.username}** • ${getCountryName(code)} (\`${code}\`)`,
          ephemeral: true
        });
      }

      if (action === "create") {
        await interaction.deferReply();

        const formation = interaction.options
          .getString("formation")
          .trim();

        const rawPlayers = interaction.options.getString("players");
        const rawBench = interaction.options.getString("bench") || "";

        if (formation.length > 30) {
          return interaction.editReply("Formation name is too long.");
        }

        const players = parseCustomPlayers(rawPlayers);
        const bench = extractMentions(rawBench);

        if (players.length < 1 || players.length > 11) {
          return interaction.editReply(
            "A lineup must contain between 1 and 11 starting players."
          );
        }

        if (new Set([...players.map(p => p.userId), ...bench]).size !== players.length + bench.length) {
          return interaction.editReply(
            "A player cannot appear twice in the starting lineup or bench."
          );
        }

        await validatePlayers(
          interaction.guild,
          [...players.map(p => p.userId), ...bench]
        );

        const embed = createLineupEmbed(
          formation,
          players,
          bench
        );

        const mentions = getMentions(players);

        return interaction.editReply({
          content: `**STARTING LINEUP**\n${mentions}`,
          embeds: [embed],
          allowedMentions: {
            users: players.map(p => p.userId)
          }
        });
      }
    }

    // FRIENDLY COMMAND

    if (interaction.commandName === "friendly") {
      await interaction.deferReply();

      const format = interaction.options.getString("format");
      const rawPlayers = interaction.options.getString("players");
      const rawBench = interaction.options.getString("bench") || "";

      const positions = FRIENDLY_POSITIONS[format];

      if (!positions) {
        return interaction.editReply("Invalid friendly format.");
      }

      const players = parseFriendlyPlayers(
        rawPlayers,
        positions
      );

      const bench = extractMentions(rawBench);

      const allIds = [
        ...players.map(player => player.userId),
        ...bench
      ];

      if (new Set(allIds).size !== allIds.length) {
        return interaction.editReply(
          "A player cannot appear twice in the starting lineup or bench."
        );
      }

      await validatePlayers(interaction.guild, allIds);

      const friendly = {
        format,
        players,
        bench,
        createdBy: interaction.user.id,
        createdAt: Date.now()
      };

      data.friendlies[interaction.guild.id] = friendly;
      saveData();

      return sendFriendly(interaction, friendly);
    }

    // SUBSTITUTION COMMAND

    if (interaction.commandName === "sub") {
      await interaction.deferReply();

      const friendly = data.friendlies[interaction.guild.id];

      if (!friendly) {
        return interaction.editReply(
          "There is no active friendly lineup. Create one using `/friendly` first."
        );
      }

      if (
        friendly.createdBy !== interaction.user.id &&
        !interaction.memberPermissions.has("ManageGuild")
      ) {
        return interaction.editReply(
          "Only the person who created the friendly lineup or a server manager can make substitutions."
        );
      }

      const outgoing = interaction.options.getUser("outgoing");
      const incoming = interaction.options.getUser("incoming");

      if (outgoing.id === incoming.id) {
        return interaction.editReply(
          "The incoming and outgoing players must be different."
        );
      }

      const outgoingIndex = friendly.players.findIndex(
        player => player.userId === outgoing.id
      );

      if (outgoingIndex === -1) {
        return interaction.editReply(
          `${outgoing} is not currently in the starting lineup.`
        );
      }

      if (friendly.players.some(player => player.userId === incoming.id)) {
        return interaction.editReply(
          `${incoming} is already playing.`
        );
      }

      await validatePlayers(
        interaction.guild,
        [outgoing.id, incoming.id]
      );

      const incomingBenchIndex = friendly.bench.indexOf(incoming.id);

      if (incomingBenchIndex !== -1) {
        friendly.bench.splice(incomingBenchIndex, 1);
      }

      const position = friendly.players[outgoingIndex].position;

      friendly.players[outgoingIndex] = {
        position,
        userId: incoming.id
      };

      friendly.bench.push(outgoing.id);

      data.friendlies[interaction.guild.id] = friendly;
      saveData();

      const embed = createFriendlyEmbed(
        friendly,
        interaction.guild
      );

      return interaction.editReply({
        content:
          `**SUBSTITUTION COMPLETE**\n` +
          `${getFlag(getCountryCode(outgoing.id))} ${outgoing} → OUT\n` +
          `${getFlag(getCountryCode(incoming.id))} ${incoming} → IN\n\n` +
          `**UPDATED STARTING LINEUP**\n${getMentions(friendly.players)}`,
        embeds: [embed],
        allowedMentions: {
          users: friendly.players.map(p => p.userId)
        }
      });
    }

  } catch (error) {
    console.error("Interaction error:", error);

    const message = error.message || "An unexpected error occurred.";

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: `Something went wrong: ${message}`,
        embeds: []
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: `Something went wrong: ${message}`,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ORIGINAL MEMBERCOUNT COMMAND

client.on("messageCreate", async message => {
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
    .setColor(COLORS.main)
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

  if (message.author.id === SUZERAIN_ID) {
    await message.channel.send("my suzerain");
  }
});

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN in environment variables.");
}

if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
  throw new Error("Missing CLIENT_ID or GUILD_ID in environment variables.");
}

loadData();

client.login(process.env.DISCORD_TOKEN);
