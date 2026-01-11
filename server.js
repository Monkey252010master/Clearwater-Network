// --------------------------------------------------
// IMPORTS
// --------------------------------------------------
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const session = require('express-session');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();

// Needed to read POST form data
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// DISCORD BOT CLIENT
// --------------------------------------------------
let botReady = false;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.login(config.botToken);

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  botReady = true;
});

// --------------------------------------------------
// LOG STORAGE (JSON FILE)
// --------------------------------------------------
function loadLogs() {
  const filePath = path.join(__dirname, 'data', 'logs.json');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
}

function saveLog(newLog) {
  const filePath = path.join(__dirname, 'data', 'logs.json');
  const logs = loadLogs();
  logs.unshift(newLog); // newest first
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
}

// --------------------------------------------------
// PASSPORT + SESSION
// --------------------------------------------------
app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy(
  {
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify']
  },
  function (accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --------------------------------------------------
// ROLE CHECKS
// --------------------------------------------------
async function isUserStaff(discordId) {
  if (!botReady) return false;

  try {
    const guild = await client.guilds.fetch(config.guildID);
    const member = await guild.members.fetch(discordId);
    return member.roles.cache.has(config.staffRoleID);
  } catch (err) {
    console.error("Staff role check failed:", err);
    return false;
  }
}

async function isUserCAD(discordId) {
  if (!botReady) return false;

  try {
    const guild = await client.guilds.fetch(config.guildID);
    const member = await guild.members.fetch(discordId);
    return member.roles.cache.has(config.cadRoleID);
  } catch (err) {
    console.error("CAD role check failed:", err);
    return false;
  }
}

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------
async function requireStaff(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/auth/discord');

  const staff = await isUserStaff(req.user.id);
  if (!staff) return res.render('noaccess', { title: 'Access Denied' });

  next();
}

async function requireCAD(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/auth/discord');

  const cadAccess = await isUserCAD(req.user.id);
  if (!cadAccess) return res.render('noaccess', { title: 'Access Denied' });

  next();
}

// --------------------------------------------------
// GLOBAL EJS VARIABLES
// --------------------------------------------------
app.use(async (req, res, next) => {
  res.locals.user = req.user;
  res.locals.isStaff = false;
  res.locals.hasCAD = false;

  if (req.user) {
    res.locals.isStaff = await isUserStaff(req.user.id);
    res.locals.hasCAD = await isUserCAD(req.user.id);
  }

  next();
});

// --------------------------------------------------
// EJS + STATIC FILES
// --------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(expressLayouts);
app.use(express.static('public'));

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

// HOME PAGE
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// CAD PAGE (CAD role only)
app.get('/cad', requireCAD, (req, res) => {
  res.render('cad', { title: 'CAD System' });
});

// STAFF DASHBOARD
app.get('/staff', requireStaff, (req, res) => {
  const logs = loadLogs();
  res.render('staff', {
    title: 'Staff Dashboard',
    logs
  });
});

// STAFF: CREATE LOG (POST)
app.post('/staff/create-log', requireStaff, (req, res) => {
  const newLog = {
    moderator: req.body.staffDiscord || req.user.username,
    staffRoblox: req.body.staffRoblox || "Unknown",
    username: req.body.username,
    robloxId: req.body.robloxId || "Unknown",
    type: req.body.type,
    reason: req.body.reason,
    previous: req.body.previous || 0,
    created: new Date().toLocaleString()
  };

  saveLog(newLog);
  res.redirect('/staff');
});

// LOGIN
app.get('/auth/discord', passport.authenticate('discord'));

// CALLBACK
app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  async (req, res) => {
    // Optional auto-redirect logic
    if (await isUserStaff(req.user.id)) return res.redirect('/staff');
    if (await isUserCAD(req.user.id)) return res.redirect('/cad');

    res.redirect('/');
  }
);

// LOGOUT
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// --------------------------------------------------
// START SERVER (Render Safe)
// --------------------------------------------------
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});