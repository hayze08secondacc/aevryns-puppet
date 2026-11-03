
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
  friendly: "#2563EB"
};

let data = {
  countries: {},
  friendlies: {}
};

const CUSTOM_SLOTS = [
  { key: "gk", pos: "GK", description: "Goalkeeper" },
  { key: "lb", pos: "LB", description: "Left back" },
  { key: "lwb", pos: "LWB", description: "Left wing back" },
  { key: "cb1", pos: "CB", description: "First centre back" },
  { key: "cb2", pos: "CB", description: "Second centre back" },
  { key: "cb3", pos: "CB", description: "Third centre back" },
  { key: "rb", pos: "RB", description: "Right back" },
  { key: "rwb", pos: "RWB", description: "Right wing back" },
  { key: "lm", pos: "LM", description: "Left midfielder" },
  { key: "cm1", pos: "CM", description: "First central midfielder" },
  { key: "cm2", pos: "CM", description: "Second central midfielder" },
  { key: "cdm", pos: "CDM", description: "Defensive midfielder" },
  { key: "cam", pos: "CAM", description: "Attacking midfielder" },
  { key: "rm", pos: "RM", description: "Right midfielder" },
  { key: "lw", pos: "LW", description: "Left winger" },
  { key: "st1", pos: "ST", description: "First striker" },
  { key: "st2", pos: "ST", description: "Second striker" },
  { key: "rw", pos: "RW", description: "Right winger" }
];

const FRIENDLY_SLOTS = [
  { key: "st1", pos: "ST", description: "First striker" },
  { key: "st2", pos: "ST", description: "Second striker" },
  { key: "lm", pos: "LM", description: "Left midfielder" },
  { key: "cm", pos: "CM", description: "Central midfielder (9v9)" },
  { key: "rm", pos: "RM", description: "Right midfielder" },
  { key: "lb", pos: "LB", description: "Left back" },
  { key: "cb", pos: "CB", description: "Centre back" },
  { key: "rb", pos: "RB", description: "Right back" },
  { key: "gk", pos: "GK", description: "Goalkeeper" }
];

const PITCH_ROWS = [
  ["LW", "ST", "ST", "RW"],
  ["LM", "CAM", "RM"],
  ["CDM", "CM", "CM"],
  ["LWB", "LB", "CB", "CB", "CB", "RB", "RWB"],
  ["GK"]
];

// STORAGE

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

function getCountryCode(id) {
  return data.countries[id] || null;
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

function playerLabel(player) {
  return `${getFlag(getCountryCode(player.userId))} **${player.position}** — <@${player.userId}>`;
}

function getMentions(players) {
    return players.map(player => `<@${player.userId}>`).join(" ");
}

// COLLECT POSITION-NAMED PLAYERS

function collectNamedPlayers(interaction, slots) {
  const players = [];

  for (const slot of slots) {
    const user = interaction.options.getUser(slot.key);

    if (user) {
      players.push({
        userId: user.id,
        position: slot.pos
      });
    }
  }

  const ids = players.map(p => p.userId);

  if (new Set(ids).size !== ids.length) {
    throw new Error("You cannot select the same player twice.");
  }

  return players;
}

function collectBench(interaction) {
  const bench = [];

  for (let i = 1; i <= 5; i++) {
    const user = interaction.options.getUser(`bench${i}`);

    if (user) bench.push(user.id);
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
      `Players not found in this server: ${missing.map(id => `<@${id}>`).join(", ")}`
    );
  }
}

// PITCH VISUAL

function createPitch(guild, players) {
  const rows = [];

  for (const positions of PITCH_ROWS) {
    const rowPlayers = [];

    for (const position of positions) {
      const index = players.findIndex(
        (player, i) =>
          player.position === position &&
          !rowPlayers.some(item => item.index === i)
      );

      if (index !== -1) {
        const player = players[index];
        const member = guild.members.cache.get(player.userId);
        const name = (
          member?.displayName ||
          member?.user.username ||
          "Player"
        ).slice(0, 9);

        rowPlayers.push({
          index,
          text: `${getFlag(getCountryCode(player.userId))} ${name}`
        });
      }
    }

    if (rowPlayers.length) {
      rows.push(
        rowPlayers.map(item => item.text).join("   ")
      );
    }
  }

  const width = Math.max(
    24,
    ...rows.map(row => row.length)
  );

  const border = "┌" + "─".repeat(width + 2) + "┐";
  const bottom = "└" + "─".repeat(width + 2) + "┘";

  const body = rows.map(row =>
    "│ " + row.padEnd(width) + " │"
  );

  return [
    border,
    ...body,
    bottom
  ].join("\n");
}

// EMBEDS

function createLineupEmbed(guild, formation, players, bench) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.main)
    .setAuthor({
      name: "PUPPET • LINEUP GENERATOR",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`✦ ${formation} Formation`)
    .setDescription(
      "```text\n" +
      createPitch(guild, players) +
      "\n```\n" +
      players.map(playerLabel).join("\n")
    )
    .addFields(
      {
        name: "FORMATION",
        value: `\`${formation}\``,
        inline: true
      },
      {
        name: "STARTING PLAYERS",
        value: `\`${players.length}/11\``,
        inline: true
      }
    )
    .setURL("https://www.buildlineup.com/")
    .setFooter({
      text: "Puppet • Football Lineup Generator"
    })
    .setTimestamp();

  if (bench.length) {
    embed.addFields({
      name: `SUBSTITUTES • ${bench.length}`,
      value: bench.map((id, index) =>
        playerLabel({
          userId: id,
          position: `SUB ${index + 1}`
        })
      ).join("\n")
    });
  }

  embed.addFields({
    name: "BUILD YOUR VISUAL LINEUP",
    value: "[Open BuildLineup](https://www.buildlineup.com/)"
  });

  return embed;
}

function createFriendlyEmbed(guild, friendly) {
  const pitch = createPitch(
    guild,
    friendly.players
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.friendly)
    .setAuthor({
      name: "PUPPET • FRIENDLY MANAGER",
      iconURL: client.user.displayAvatarURL()
    })
    .setTitle(`✦ ${friendly.format} Friendly`)
    .setDescription(
      "```text\n" +
      pitch +
      "\n```\n" +
      friendly.players.map(playerLabel).join("\n")
    )
    .addFields(
      {
        name: "FORMAT",
        value: `\`${friendly.format}\``,
        inline: true
      },
      {
        name: "STARTING XI",
        value: `\`${friendly.players.length}/${friendly.players.length}\``,
        inline: true
      }
    );

  embed.addFields({
    name: `SUBSTITUTES • ${friendly.bench.length}`,
    value: friendly.bench.length
      ? friendly.bench.map((id, index) =>
          playerLabel({
            userId: id,
            position: `SUB ${index + 1}`
          })
        ).join("\n")
      : "No substitutes."
  });

  embed.addFields({
    name: "MATCH MANAGEMENT",
    value: "Use `/sub` to make substitutions."
  });

  embed.setFooter({
    text: `${guild.name} • Puppet Friendly Manager`
  });

  embed.setTimestamp();

  return embed;
}

// COMMAND BUILDERS

const lineup = new SlashCommandBuilder()
  .setName("lineup")
  .setDescription("Create and manage football lineups")

  .addSubcommand(sub =>
    sub
      .setName("create")
      .setDescription("Create a custom football formation")

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
          .setDescription("Country code: PL, FR, MA, ZA")
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
          .setDescription("Player to check")
      )
  );

const create = lineup.options.find(
  option => option.name === "create"
);

for (const slot of CUSTOM_SLOTS) {
  create.addUserOption(option =>
    option
      .setName(slot.key)
      .setDescription(`Select ${slot.description}`)
  );
}

for (let i = 1; i <= 5; i++) {
  create.addUserOption(option =>
    option
      .setName(`bench${i}`)
      .setDescription(`Substitute ${i}`)
  );
}

// FRIENDLY COMMAND

const friendly = new SlashCommandBuilder()
  .setName("friendly")
  .setDescription("Create an 8v8 or 9v9 friendly")

  .addStringOption(option =>
    option
      .setName("format")
      .setDescription("Choose your friendly format")
      .setRequired(true)
      .addChoices(
        { name: "8v8", value: "8v8" },
        { name: "9v9", value: "9v9" }
      )
  );

for (const slot of FRIENDLY_SLOTS) {
  friendly.addUserOption(option =>
    option
      .setName(slot.key)
      .setDescription(`Select ${slot.description}`)
  );
}

for (let i = 1; i <= 5; i++) {
  friendly.addUserOption(option =>
    option
      .setName(`bench${i}`)
      .setDescription(`Substitute ${i}`)
  );
}

// SUB COMMAND

const sub = new SlashCommandBuilder()
  .setName("sub")
  .setDescription("Make a friendly substitution")

  .addUserOption(option =>
    option
      .setName("outgoing")
      .setDescription("Player leaving")
      .setRequired(true)
  )

  .addUserOption(option =>
    option
      .setName("incoming")
      .setDescription("Player entering")
      .setRequired(true)
  );

// REGISTER

const commands = [
  lineup,
  friendly,
  sub
];

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

    console.log("All Puppet commands registered.");
  } catch (error) {
    console.error("Registration error:", error);
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

        const name = getCountryName(code);

        if (
          !name ||
          name === code ||
          name === "Unknown Region"
        ) {
          return interaction.reply({
            content: "Country not recognised.",
            ephemeral: true
          });
        }

        data.countries[interaction.user.id] = code;
        saveData();

        return interaction.reply({
          content: `${getFlag(code)} Your country is now **${name}**.`,
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
            content: `${user} has not registered a country.`,
            ephemeral: true
          });
        }

        return interaction.reply({
          content: `${getFlag(code)} **${user.username}** — ${getCountryName(code)}`,
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
            "Formation name is too long."
          );
        }

        const players = collectNamedPlayers(
          interaction,
          CUSTOM_SLOTS
        );

        const bench = collectBench(interaction);

        if (!players.length || players.length > 11) {
          return interaction.editReply(
            "Select between 1 and 11 starting players."
          );
        }

        const ids = [
          ...players.map(p => p.userId),
          ...bench
        ];

        if (new Set(ids).size !== ids.length) {
          return interaction.editReply(
            "A player cannot appear twice in the lineup or bench."
          );
        }

        await validatePlayers(
          interaction.guild,
          ids
        );

        const embed = createLineupEmbed(
          interaction.guild,
          formation,
          players,
          bench
        );

        return interaction.editReply({
          content:
            `**STARTING LINEUP**\n${getMentions(players)}`,
          embeds: [embed],
          allowedMentions: {
            users: players.map(p => p.userId)
          }
        });
      }
    }

    // FRIENDLY

    if (interaction.commandName === "friendly") {
      await interaction.deferReply();

      const format = interaction.options.getString("format");

      const players = collectNamedPlayers(
        interaction,
        FRIENDLY_SLOTS
      );

      const bench = collectBench(interaction);

      const expected = format === "8v8" ? 8 : 9;

      if (players.length !== expected) {
        return interaction.editReply(
          `${format} requires exactly ${expected} starting players. You selected ${players.length}.`
        );
      }

      if (
        format === "8v8" &&
        players.some(player => player.position === "CM")
      ) {
        return interaction.editReply(
          "8v8 does not use the CM position."
        );
      }

      const ids = [
        ...players.map(p => p.userId),
        ...bench
      ];

      if (new Set(ids).size !== ids.length) {
        return interaction.editReply(
          "A player cannot appear twice in the lineup or bench."
        );
      }

      await validatePlayers(
        interaction.guild,
        ids
      );

      const friendlyData = {
        format,
        players,
        bench,
        createdBy: interaction.user.id,
        createdAt: Date.now()
      };

      data.friendlies[interaction.guild.id] = friendlyData;
      saveData();

      return interaction.editReply({
        content:
          `**STARTING LINEUP**\n${getMentions(players)}`,
        embeds: [
          createFriendlyEmbed(
            interaction.guild,
            friendlyData
          )
        ],
        allowedMentions: {
          users: players.map(p => p.userId)
        }
      });
    }

    // SUBSTITUTION

    if (interaction.commandName === "sub") {
      await interaction.deferReply();

      const current = data.friendlies[interaction.guild.id];

      if (!current) {
        return interaction.editReply(
          "There is no active friendly. Use `/friendly` first."
        );
      }

      const manager = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
      );

      if (
        current.createdBy !== interaction.user.id &&
        !manager
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

      const index = current.players.findIndex(
        player => player.userId === outgoing.id
      );

      if (index === -1) {
        return interaction.editReply(
          `${outgoing} is not in the starting lineup.`
        );
      }

      if (
        current.players.some(
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

      const benchIndex = current.bench.indexOf(incoming.id);

      if (benchIndex !== -1) {
        current.bench.splice(benchIndex, 1);
      }

      const position = current.players[index].position;

      current.players[index] = {
        userId: incoming.id,
        position
      };

      current.bench.push(outgoing.id);

      saveData();

      return interaction.editReply({
        content:
          `**SUBSTITUTION COMPLETE**\n\n` +
          `${playerLabel({ userId: outgoing.id, position: "OUT" })}\n` +
          `${playerLabel({ userId: incoming.id, position: "IN" })}\n\n` +
          `**UPDATED LINEUP**\n${getMentions(current.players)}`,
        embeds: [
          createFriendlyEmbed(
            interaction.guild,
            current
          )
        ],
        allowedMentions: {
          users: current.players.map(p => p.userId)
        }
      });
    }

  } catch (error) {
    console.error("Interaction error:", error);

    const response = {
      content: `Something went wrong: ${error.message || "Unknown error"}`,
      embeds: []
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response).catch(() => {});
    } else {
      await interaction.reply({
        ...response,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// MEMBER COUNT

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

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
