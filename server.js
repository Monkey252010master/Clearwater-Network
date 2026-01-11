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
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

client.login(config.botToken);

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
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

passport.use(new DiscordStrategy({
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.callbackURL,
    scope: ['identify']
  },
  function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --------------------------------------------------
// STAFF CHECK USING BOT
// --------------------------------------------------
async function isUserStaff(discordId) {
  try {
    const guild = await client.guilds.fetch(config.guildID);
    const member = await guild.members.fetch(discordId);

    return member.roles.cache.has(config.staffRoleID);
  } catch (err) {
    console.error("Role check failed:", err);
    return false;
  }
}

// --------------------------------------------------
// STAFF-ONLY MIDDLEWARE
// --------------------------------------------------
async function requireStaff(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/discord');
  }

  const staff = await isUserStaff(req.user.id);
  if (!staff) {
    return res.render('noaccess', { title: 'Access Denied' });
  }

  next();
}

// --------------------------------------------------
// GLOBAL EJS VARIABLES
// --------------------------------------------------
app.use(async (req, res, next) => {
  res.locals.user = req.user;
  res.locals.isStaff = false;

  if (req.user) {
    const staff = await isUserStaff(req.user.id);
    res.locals.isStaff = staff;
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

// CAD PAGE (staff only)
app.get('/cad', requireStaff, (req, res) => {
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

app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// LOGOUT
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});