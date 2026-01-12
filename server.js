// --------------------------------------------------
// IMPORTS
// --------------------------------------------------
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const session = require('express-session');
const FileStore = require('session-file-store')(session);
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
function getLogsFilePath() {
  return path.join(__dirname, 'data', 'logs.json');
}

function loadLogs() {
  const filePath = getLogsFilePath();
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
}

function saveLogs(logs) {
  const filePath = getLogsFilePath();
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
}

// --------------------------------------------------
// STAFF ACTIVITY STORAGE
// --------------------------------------------------
function getActivityFilePath() {
  return path.join(__dirname, 'data', 'activity.json');
}

function loadActivity() {
  const filePath = getActivityFilePath();
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath);
  return JSON.parse(raw);
}

function saveActivity(activity) {
  const filePath = getActivityFilePath();
  fs.writeFileSync(filePath, JSON.stringify(activity, null, 2));
}

function addActivity(user, action) {
  const activity = loadActivity();

  activity.unshift({
    user: user.username,
    userId: user.id,
    avatar: user.avatar,
    action,
    time: new Date().toLocaleString()
  });

  saveActivity(activity);
}

// --------------------------------------------------
// SESSION (MUST COME BEFORE PASSPORT)
// --------------------------------------------------
app.use(session({
  store: new FileStore({
    path: './data/sessions',
    retries: 1
  }),
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// --------------------------------------------------
// PASSPORT
// --------------------------------------------------
app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new DiscordStrategy(
    {
      clientID: config.clientID,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      scope: ['identify']
    },
    function (accessToken, refreshToken, profile, done) {
      return done(null, profile);
    }
  )
);

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

async function isUserHR(discordId) {
  try {
    const guild = await client.guilds.fetch(config.guildID);
    const member = await guild.members.fetch(discordId);

    return member.roles.cache.has(config.hrRoleID);
  } catch (err) {
    console.error('Error checking HR role:', err);
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

async function requireHR(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/auth/discord');

  const hr = await isUserHR(req.user.id);
  if (!hr) return res.render('noaccess', { title: 'Access Denied' });

  next();
}

// ⭐ THIS is the missing part — your global middleware
app.use(async (req, res, next) => {
  res.locals.user = req.user;
  res.locals.isStaff = false;
  res.locals.hasCAD = false;
  res.locals.isHR = false;

  if (req.user) {
    res.locals.isStaff = await isUserStaff(req.user.id);
    res.locals.hasCAD = await isUserCAD(req.user.id);
    res.locals.isHR = await isUserHR(req.user.id);
  }

  next();
});

// --------------------------------------------------
// GLOBAL EJS VARIABLES
// --------------------------------------------------
app.use(async (req, res, next) => {
  res.locals.user = req.user;
  res.locals.isStaff = false;
  res.locals.hasCAD = false;
  res.locals.isHR = false;

  if (req.user) {
    res.locals.isStaff = await isUserStaff(req.user.id);
    res.locals.hasCAD = await isUserCAD(req.user.id);
    res.locals.isHR = await isUserHR(req.user.id);
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
app.get('/staff', requireStaff, async (req, res) => {
  const logs = await getRecentLogs(50);

  res.render('staff', {
    title: 'Staff Dashboard',
    logs
  });
});

// STAFF: CREATE LOG
app.post('/staff/create-log', requireStaff, async (req, res) => {
  const { targetId, targetName, action, reason } = req.body;

  await createLog({
    staffDiscordId: req.user.id,
    staffName: req.user.username,
    targetDiscordId: targetId,
    targetName,
    action,
    reason
  });

  res.redirect('/staff');
});

// STAFF: DELETE LOG
app.post('/staff/delete-log/:id', requireHR, async (req, res) => {
  await deleteLogById(req.params.id);
  res.redirect('/staff');
});

// LOGIN
app.get('/auth/discord', passport.authenticate('discord'));

// CALLBACK
app.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  async (req, res) => {
    if (await isUserStaff(req.user.id)) return res.redirect('/');
    if (await isUserCAD(req.user.id)) return res.redirect('/');
    res.redirect('/');
  }
);

// HR
app.get('/hr', requireHR, async (req, res) => {
  const activity = loadActivity().slice(0, 50); // still JSON for now
  const logs = await getRecentLogs(200);

  res.render('hr', {
    title: 'HR Dashboard',
    activity,
    logs
  });
});

// LOGOUT
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
