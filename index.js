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

// RANK ROLE MANAGEMENT

function normalizeRoleName(name) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findRankRole(guild, rank) {
  const matches = guild.roles.cache.filter(role =>
    normalizeRoleName(role.name).includes(rank)
  );

  if (matches.size === 0) {
    throw new Error(
      `I couldn't find a role containing **${rank.toUpperCase()}**. Make sure the rank role exists.`
    );
  }

  if (matches.size > 1) {
    throw new Error(
      `I found multiple roles matching **${rank.toUpperCase()}**: ${matches.map(role => `\`${role.name}\``).join(", ")}. Rename them so only one role matches.`
    );
  }

  return matches.first();
}

function getMemberRank(member) {
  const ranks = ["d1", "d2", "d3", "d4"];
  const matches = [];

  for (const rank of ranks) {
    const role = findRankRoleSafe(member.guild, rank);

    if (role && member.roles.cache.has(role.id)) {
      matches.push({ rank, role });
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `${member} doesn't have a D1, D2, D3 or D4 rank role.`
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `${member} has more than one D1-D4 rank role. Remove the extra rank role first.`
    );
  }

  return matches[0];
}

function findRankRoleSafe(guild, rank) {
  const matches = guild.roles.cache.filter(role =>
    normalizeRoleName(role.name).includes(rank)
  );

  if (matches.size > 1) {
    throw new Error(
      `Multiple roles match **${rank.toUpperCase()}**: ${matches.map(role => `\`${role.name}\``).join(", ")}.`
    );
  }

  return matches.first() || null;
}

async function changeMemberRank(interaction, direction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error(
      "You need the **Manage Roles** permission to use this command."
    );
  }

  const guild = interaction.guild;

  const botMember =
    guild.members.me ||
    await guild.members.fetch(client.user.id);

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error(
      "I need the **Manage Roles** permission to change rank roles."
    );
  }

  await guild.roles.fetch();

  const user = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  const member = await guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    throw new Error("That user is no longer in this server.");
  }

  if (member.id === guild.ownerId) {
    throw new Error(
      "The server owner's rank cannot be changed by this command."
    );
  }

  if (interaction.user.id !== guild.ownerId) {
    const actor = await guild.members.fetch(interaction.user.id);

    if (
      actor.roles.highest.comparePositionTo(
        member.roles.highest
      ) <= 0
    ) {
      throw new Error(
        "You can only change the rank of members below your highest role."
      );
    }
  }

  const current = getMemberRank(member);

  const order = ["d1", "d2", "d3", "d4"];

  const currentIndex = order.indexOf(current.rank);

  const nextIndex =
    currentIndex +
    (direction === "demote" ? amount : -amount);

  if (nextIndex < 0 || nextIndex > 3) {
    throw new Error(
      direction === "demote"
        ? `${member} is **${current.rank.toUpperCase()}**. They cannot be demoted ${amount} more ranks; D4 is the lowest rank.`
        : `${member} is **${current.rank.toUpperCase()}**. They cannot be promoted ${amount} more ranks; D1 is the highest rank.`
    );
  }

  const nextRank = order[nextIndex];
  const nextRole = findRankRole(guild, nextRank);

  if (nextRole.id === current.role.id) {
    throw new Error(
      "The current and destination rank roles are the same."
    );
  }

  if (!current.role.editable || !nextRole.editable) {
    throw new Error(
      "I can't edit one of those roles. Move my bot role above both rank roles in Server Settings → Roles."
    );
  }

  if (interaction.user.id !== guild.ownerId) {
    const actor = await guild.members.fetch(interaction.user.id);

    if (
      nextRole.comparePositionTo(actor.roles.highest) >= 0
    ) {
      throw new Error(
        "You cannot assign a role that is equal to or higher than your highest role."
      );
    }
  }

  await member.roles.add(
    nextRole,
    `${direction} by ${interaction.user.tag}`
  );

  try {
    await member.roles.remove(
      current.role,
      `${direction} by ${interaction.user.tag}`
    );
  } catch (error) {
    await member.roles.remove(
      nextRole,
      "Rollback after rank change failed"
    ).catch(() => {});

    throw new Error(
      `I couldn't remove the old role, so I rolled back the new role. Check my role permissions and hierarchy. (${error.message})`
    );
  }

  return {
    content:
      `**RANK ${direction.toUpperCase()} COMPLETE**\n\n` +
      `**Member:** ${member}\n` +
      `**Previous rank:** ${current.rank.toUpperCase()} — ${current.role}\n` +
      `**New rank:** ${nextRank.toUpperCase()} — ${nextRole}\n` +
      `**Change:** ${amount} rank${amount === 1 ? "" : "s"} ${direction === "demote" ? "down" : "up"}\n` +
      `**Changed by:** ${interaction.user}`,
    allowedMentions: {
      users: [member.id],
      roles: [current.role.id, nextRole.id]
    }
  };
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

// PROMOTE / DEMOTE COMMANDS

const demote = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a member by 1 to 3 ranks")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Member to demote")
      .setRequired(true)
  )

  .addIntegerOption(option =>
    option
      .setName("amount")
      .setDescription("Number of ranks to demote")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(3)
  );

const promote = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a member by 1 to 3 ranks")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Member to promote")
      .setRequired(true)
  )

  .addIntegerOption(option =>
    option
      .setName("amount")
      .setDescription("Number of ranks to promote")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(3)
  );

// REGISTER

const commands = [
  lineup,
  friendly,
  sub,
  demote,
  promote
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

    // RANK MANAGEMENT

    if (
      interaction.commandName === "demote" ||
      interaction.commandName === "promote"
    ) {
      await interaction.deferReply({
        ephemeral: true
      });

      const result = await changeMemberRank(
        interaction,
        interaction.commandName
      );

      return interaction.editReply(result);
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
