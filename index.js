
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
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

const PREFIX = "?";
const SUZERAIN_ID = "1382832095394529361";
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

// DATA STORAGE

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );

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
    fs.mkdirSync(path.dirname(DATA_FILE), {
      recursive: true
    });

    const temp = DATA_FILE + ".tmp";

    fs.writeFileSync(
      temp,
      JSON.stringify(data, null, 2)
    );

    fs.renameSync(temp, DATA_FILE);
  } catch (error) {
    console.error("Data saving error:", error);
  }
}

// COUNTRIES

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
  if (!code || !/^[A-Z]{2}$/.test(code)) {
    return "🏳️";
  }

  return String.fromCodePoint(
    ...[...code].map(char =>
      127397 + char.charCodeAt(0)
    )
  );
}

function getPlayerLabel(userId, position) {
  const code = getCountryCode(userId);
  const flag = getFlag(code);

  return `${flag} **${position}** — <@${userId}>`;
}

// PLAYER SELECTION

function collectPlayers(interaction, max, positionMode) {
  const players = [];
  let gapFound = false;

  for (let i = 1; i <= max; i++) {
    const user = interaction.options.getUser(`player${i}`);

    if (!user) {
      gapFound = true;
      continue;
    }

    if (gapFound) {
      throw new Error(
        `Player ${i} is selected while an earlier player slot is empty. Fill player slots in order.`
      );
    }

    let position = `P${i}`;

    if (positionMode) {
      position =
        interaction.options.getString(`position${i}`) ||
        `P${i}`;

      position = position.trim().toUpperCase();

      if (!/^[A-Z0-9+/-]{1,10}$/.test(position)) {
        throw new Error(`Invalid position for player ${i}.`);
      }
    }

    players.push({
      userId: user.id,
      position
    });
  }

  const ids = players.map(player => player.userId);

  if (new Set(ids).size !== ids.length) {
    throw new Error(
      "You cannot select the same player twice."
    );
  }

  return players;
}

function collectBench(interaction, max = 5) {
  const bench = [];

  for (let i = 1; i <= max; i++) {
    const user = interaction.options.getUser(`bench${i}`);

    if (user) {
      bench.push(user.id);
    }
  }

  if (new Set(bench).size !== bench.length) {
    throw new Error("Duplicate substitutes are not allowed.");
  }

  return bench;
}

async function validatePlayers(guild, ids) {
  const unique = [...new Set(ids)];

  const members = await Promise.all(
    unique.map(id =>
      guild.members.fetch(id).catch(() => null)
    )
  );

  const missing = unique.filter(
    (id, index) => !members[index]
  );

  if (missing.length) {
    throw new Error(
      `These players are not in this server: ${missing.map(id => `<@${id}>`).join(", ")}`
    );
  }
}

// EMBEDS

function getMentions(players) {
  return players
    .map(player => `<@${player.userId}>`)
    .join(" ");
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
        getPlayerLabel(
          player.userId,
          player.position
        )
      ).join("\n")
    )
    .addFields(
      {
        name: "FORMATION",
        value: `\`${formation}\``,
        inline: true
      },
      {
        name: "STARTING XI",
        value: `\`${players.length}\``,
        inline: true
      }
    )
    .setURL("https://www.buildlineup.com/")
    .setFooter({
      text: "Puppet • BuildLineup Generator"
    })
    .setTimestamp();

  if (bench.length) {
    embed.addFields({
      name: `SUBSTITUTES • ${bench.length}`,
      value: bench.map((id, i) =>
        getPlayerLabel(id, `SUB ${i + 1}`)
      ).join("\n")
    });
  }

  embed.addFields({
    name: "BUILD YOUR VISUAL LINEUP",
    value: "[Open BuildLineup](https://www.buildlineup.com/)"
  });

  return embed;
}

function createFriendlyEmbed(friendly, guild) {
  const shape = friendly.format === "8v8"
    ? "2-2-3"
    : "2-3-3";

  const embed = new EmbedBuilder()
    .setColor(COLORS.friendly)
    .setAuthor({
      name: "PUPPET • FRIENDLY MANAGER",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`✦ ${friendly.format} Friendly`)
    .setDescription(
      friendly.players.map(player =>
        getPlayerLabel(
          player.userId,
          player.position
        )
      ).join("\n")
    )
    .addFields(
      {
        name: "FORMATION",
        value: `\`${shape}\``,
        inline: true
      },
      {
        name: "STARTING PLAYERS",
        value: `\`${friendly.players.length}/${friendly.players.length}\``,
        inline: true
      },
      {
        name: "SUBSTITUTIONS",
        value: "Use `/sub` to replace a player. The outgoing player moves to the bench."
      }
    );

  if (friendly.bench.length) {
    embed.addFields({
      name: `BENCH • ${friendly.bench.length}`,
      value: friendly.bench.map((id, i) =>
        getPlayerLabel(id, `SUB ${i + 1}`)
      ).join("\n")
    });
  } else {
    embed.addFields({
      name: "BENCH",
      value: "No substitutes registered."
    });
  }

  embed.setFooter({
    text: `${guild.name} • Puppet Friendly Manager`
  });

  embed.setTimestamp();

  return embed;
}

// SLASH COMMANDS

const lineupCommand = new SlashCommandBuilder()
  .setName("lineup")
  .setDescription("Create and manage football lineups")

  .addSubcommand(sub =>
    sub
      .setName("create")
      .setDescription("Build a custom football lineup")

      .addStringOption(option =>
        option
          .setName("formation")
          .setDescription("Formation name, e.g. 4-3-3")
          .setRequired(true)
      )
  )

  .addSubcommand(sub =>
    sub
      .setName("setcountry")
      .setDescription("Register your country")

      .addStringOption(option =>
        option
          .setName("country")
          .setDescription("Two-letter country code, e.g. PL, FR, MA")
          .setRequired(true)
      )
  )

  .addSubcommand(sub =>
    sub
      .setName("mycountry")
      .setDescription("Check your registered country")

      .addUserOption(option =>
        option
          .setName("player")
          .setDescription("Player to check")
      )
  );

// Add individual player and position selectors.

const createSubcommand = lineupCommand.options.find(
  option => option.name === "create"
);

for (let i = 1; i <= 11; i++) {
  createSubcommand.addUserOption(option =>
    option
      .setName(`player${i}`)
      .setDescription(`Starting player ${i}`)
      .setRequired(i === 1)
  );
}

for (let i = 1; i <= 11; i++) {
  createSubcommand.addStringOption(option =>
    option
      .setName(`position${i}`)
      .setDescription(`Position for player ${i}, e.g. ST, CB, GK`)
      .setRequired(false)
  );
}

createSubcommand.addStringOption(option =>
  option
    .setName("bench")
    .setDescription("Optional substitute mentions separated by spaces")
);

// FRIENDLY COMMAND

const friendlyCommand = new SlashCommandBuilder()
  .setName("friendly")
  .setDescription("Create an 8v8 or 9v9 friendly")

  .addStringOption(option =>
    option
      .setName("format")
      .setDescription("Friendly format")
      .setRequired(true)
      .addChoices(
        { name: "8v8", value: "8v8" },
        { name: "9v9", value: "9v9" }
      )
  );

for (let i = 1; i <= 9; i++) {
  friendlyCommand.addUserOption(option =>
    option
      .setName(`player${i}`)
      .setDescription(`Starting player ${i}`)
      .setRequired(i === 1)
  );
}

for (let i = 1; i <= 5; i++) {
  friendlyCommand.addUserOption(option =>
    option
      .setName(`bench${i}`)
      .setDescription(`Substitute ${i}`)
  );
}

// SUB COMMAND

const subCommand = new SlashCommandBuilder()
  .setName("sub")
  .setDescription("Substitute a player in the active friendly")

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
  );

const commands = [
  lineupCommand,
  friendlyCommand,
  subCommand
];

// REGISTER COMMANDS

client.once("ready", async () => {
  console.log(`Puppet is online as ${client.user.tag}`);
  console.log("Ready to serve.");

  const rest = new REST({
    version: "10"
  }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands.map(command =>
          command.toJSON()
        )
      }
    );

    console.log("Puppet slash commands registered.");
  } catch (error) {
    console.error("Command registration error:", error);
  }
});

// INTERACTIONS

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  try {

    // LINEUP

    if (interaction.commandName === "lineup") {
      const action = interaction.options.getSubcommand();

      if (action === "setcountry") {
        const code = interaction.options
          .getString("country")
          .trim()
          .toUpperCase();

        if (!/^[A-Z]{2}$/.test(code)) {
          return interaction.reply({
            content: "Enter a valid two-letter country code.",
            ephemeral: true
          });
        }

        const country = getCountryName(code);

        if (
          !country ||
          country === code ||
          country === "Unknown Region"
        ) {
          return interaction.reply({
            content: "That country code is not recognised.",
            ephemeral: true
          });
        }

        data.countries[interaction.user.id] = code;
        saveData();

        return interaction.reply({
          content: `${getFlag(code)} Your country is now registered as **${country}**.`,
          ephemeral: true
        });
      }

      if (action === "mycountry") {
        const user =
          interaction.options.getUser("player") ||
          interaction.user;

        const code = getCountryCode(user.id);

        if (!code) {
          return interaction.reply({
            content: `${user} has not registered a country. Use \`/lineup setcountry\`.`,
            ephemeral: true
          });
        }

        return interaction.reply({
          content: `${getFlag(code)} **${user.username}** • ${getCountryName(code)}`,
          ephemeral: true
        });
      }

      if (action === "create") {
        await interaction.deferReply();

        const formation = interaction.options
          .getString("formation")
          .trim();

        if (formation.length > 30) {
          return interaction.editReply(
            "Formation name must be under 30 characters."
          );
        }

        const players = collectPlayers(
          interaction,
          11,
          true
        );

        const benchText =
          interaction.options.getString("bench") || "";

        const bench = [
          ...benchText.matchAll(/<@!?(\d+)>/g)
        ].map(match => match[1]);

        if (!players.length || players.length > 11) {
          return interaction.editReply(
            "Select between 1 and 11 starting players."
          );
        }

        const allIds = [
          ...players.map(player => player.userId),
          ...bench
        ];

        if (new Set(allIds).size !== allIds.length) {
          return interaction.editReply(
            "A player cannot appear twice in the lineup or bench."
          );
        }

        await validatePlayers(
          interaction.guild,
          allIds
        );

        const embed = createLineupEmbed(
          formation,
          players,
          bench
        );

        return interaction.editReply({
          content:
            `**STARTING LINEUP**\n${getMentions(players)}`,
          embeds: [embed],
          allowedMentions: {
            users: players.map(player => player.userId)
          }
        });
      }
    }

    // FRIENDLY

    if (interaction.commandName === "friendly") {
      await interaction.deferReply();

      const format = interaction.options.getString("format");
      const positions = FRIENDLY_POSITIONS[format];

      const players = collectPlayers(
        interaction,
        9,
        false
      );

      const bench = collectBench(interaction);

      if (players.length !== positions.length) {
        return interaction.editReply(
          `${format} requires exactly ${positions.length} starting players. You selected ${players.length}.`
        );
      }

      players.forEach((player, index) => {
        player.position = positions[index];
      });

      const allIds = [
        ...players.map(player => player.userId),
        ...bench
      ];

      if (new Set(allIds).size !== allIds.length) {
        return interaction.editReply(
          "A player cannot appear twice in the starting lineup or bench."
        );
      }

      await validatePlayers(
        interaction.guild,
        allIds
      );

      const friendly = {
        format,
        players,
        bench,
        createdBy: interaction.user.id,
        createdAt: Date.now()
      };

      data.friendlies[interaction.guild.id] = friendly;
      saveData();

      return interaction.editReply({
        content:
          `**STARTING LINEUP**\n${getMentions(players)}`,
        embeds: [
          createFriendlyEmbed(
            friendly,
            interaction.guild
          )
        ],
        allowedMentions: {
          users: players.map(player => player.userId)
        }
      });
    }

    // SUBSTITUTIONS

    if (interaction.commandName === "sub") {
      await interaction.deferReply();

      const friendly = data.friendlies[interaction.guild.id];

      if (!friendly) {
        return interaction.editReply(
          "There is no active friendly. Create one using `/friendly`."
        );
      }

      const isManager =
        interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        );

      if (
        friendly.createdBy !== interaction.user.id &&
        !isManager
      ) {
        return interaction.editReply(
          "Only the friendly creator or a server manager can make substitutions."
        );
      }

      const outgoing = interaction.options.getUser("outgoing");
      const incoming = interaction.options.getUser("incoming");

      if (outgoing.id === incoming.id) {
        return interaction.editReply(
          "Choose two different players."
        );
      }

      const outgoingIndex = friendly.players.findIndex(
        player => player.userId === outgoing.id
      );

      if (outgoingIndex === -1) {
        return interaction.editReply(
          `${outgoing} is not in the starting lineup.`
        );
      }

      if (
        friendly.players.some(
          player => player.userId === incoming.id
        )
      ) {
        return interaction.editReply(
          `${incoming} is already playing.`
        );
      }

      await validatePlayers(
        interaction.guild,
        [outgoing.id, incoming.id]
      );

      const benchIndex = friendly.bench.indexOf(incoming.id);

      if (benchIndex !== -1) {
        friendly.bench.splice(benchIndex, 1);
      }

      const position =
        friendly.players[outgoingIndex].position;

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
          `**SUBSTITUTION COMPLETE**\n\n` +
          `${getPlayerLabel(outgoing.id, "OUT")}\n` +
          `${getPlayerLabel(incoming.id, "IN")}\n\n` +
          `**UPDATED LINEUP**\n${getMentions(friendly.players)}`,
        embeds: [embed],
        allowedMentions: {
          users: friendly.players.map(player => player.userId)
        }
      });
    }

  } catch (error) {
    console.error("Interaction error:", error);

    const message = error.message ||
      "An unexpected error occurred.";

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
    .setThumbnail(
      message.guild.iconURL({ size: 256 })
    )
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

// STARTUP

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN.");
}

if (!process.env.CLIENT_ID) {
  throw new Error("Missing CLIENT_ID.");
}

if (!process.env.GUILD_ID) {
  throw new Error("Missing GUILD_ID.");
}

loadData();

client.login(process.env.DISCORD_TOKEN);
