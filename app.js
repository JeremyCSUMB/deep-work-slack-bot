const { App, ExpressReceiver } = require('@slack/bolt');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const cron = require('node-cron');

dotenv.config();

console.log('Environment variables:');
Object.keys(process.env).forEach(key => {
  if (key.startsWith('SLACK_') || key.startsWith('MONGODB_')) {
    console.log(`${key}: [REDACTED]`);
  } else {
    console.log(`${key}: ${process.env[key]}`);
  }
});

const DEEPWORK_TIMEOUT_MINUTES = parseInt(process.env.DEEPWORK_TIMEOUT_MINUTES) || 180;
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15;

console.log(`DEEPWORK_TIMEOUT_MINUTES: ${DEEPWORK_TIMEOUT_MINUTES}`);
console.log(`CHECK_INTERVAL_MINUTES: ${CHECK_INTERVAL_MINUTES}`);

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

async function connectToDatabase() {
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
    db = mongoClient.db('deep_work_tracker');
    console.log('Using Database:', db.databaseName);
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
}

async function storeSession(session) {
  const sessions = db.collection('sessions');
  if (session._id) {
    await sessions.updateOne(
      { _id: session._id },
      { $set: session },
      { upsert: true }
    );
  } else {
    await sessions.insertOne(session);
  }
}

async function getSessionsByUser(userId) {
  const sessions = db.collection('sessions');
  return await sessions.find({ userId: userId }).toArray();
}

async function getAllSessions() {
  const sessions = db.collection('sessions');
  return await sessions.find({}).toArray();
}

async function closeSession(session, client, reason = 'concluded') {
  const endTime = new Date();
  const duration = Math.round((endTime - session.startTime) / 60000);

  let status;
  let message;
  if (reason === 'timeout') {
    status = 'timed out';
    message = `<@${session.userId}>'s deep work session has timed out after ${duration} minutes and is considered invalid.`;
  } else {
    status = 'concluded';
    message = `<@${session.userId}> has ended their deep work session (duration: ${duration} minutes)\nReflection: ${session.reflection}`;
  }

  await storeSession({
    ...session,
    endTime: endTime,
    duration: duration,
    status: status
  });

  await client.chat.postMessage({
    channel: session.channelId,
    text: message
  });
}

async function checkAndCloseInactiveSessions(client) {
  console.log('Starting inactive session check...');
  const sessions = db.collection('sessions');
  const timeoutMs = DEEPWORK_TIMEOUT_MINUTES * 60 * 1000;
  const currentTime = new Date();

  console.log(`Current time: ${currentTime.toISOString()}`);
  console.log(`Timeout duration: ${DEEPWORK_TIMEOUT_MINUTES} minutes`);

  const cutoffTime = new Date(currentTime.getTime() - timeoutMs);
  console.log(`Cutoff time: ${cutoffTime.toISOString()}`);

  const inactiveSessions = await sessions.find({
    status: 'in progress',
    startTime: { $lt: cutoffTime }
  }).toArray();

  console.log(`Found ${inactiveSessions.length} potentially inactive sessions`);

  for (const session of inactiveSessions) {
    console.log(`Examining session: ${JSON.stringify(session, null, 2)}`);
    const sessionDuration = (currentTime - new Date(session.startTime)) / (1000 * 60);
    console.log(`Session duration: ${sessionDuration.toFixed(2)} minutes`);

    if (sessionDuration > DEEPWORK_TIMEOUT_MINUTES) {
      console.log(`Closing session for user ${session.userId}`);
      await closeSession(session, client, 'timeout');
    } else {
      console.log(`Session not yet timed out. Skipping.`);
    }
  }
}

app.command('/deepwork', async ({ command, ack, say, client, respond }) => {
  await ack();
  const userId = command.user_id;
  const text = command.text.trim();

  const userSessions = await getSessionsByUser(userId);
  const activeSession = userSessions.find(session => session.status === 'in progress');

  if (activeSession) {
    // Ending a session
    if (!text) {
      await respond({
        text: "Please provide a reflection when ending your deep work session. Use the format: /deepwork your reflection here",
        response_type: 'ephemeral'
      });
      return;
    }

    await closeSession({
      ...activeSession,
      reflection: text
    }, client);

  } else {
    // Starting a session
    if (!text) {
      await respond({
        text: "Please provide a description when starting your deep work session. Use the format: /deepwork your description here",
        response_type: 'ephemeral'
      });
      return;
    }

    const userInfo = await client.users.info({ user: userId });
    const newSession = {
      userId: userId,
      name: userInfo.user.real_name,
      email: userInfo.user.profile.email,
      startTime: new Date(),
      channelId: command.channel_id,
      description: text,
      status: 'in progress'
    };

    await storeSession(newSession);
    await say(`<@${userId}> has started a deep work session\nDescription: ${text}`);
  }
});

app.event('app_mention', async ({ event, say }) => {
  await say(`Hello <@${event.user}>! How can I assist you with your deep work session?`);
});

// Export sessions endpoint
receiver.router.get('/export-sessions', async (req, res) => {
  try {
    const allSessions = await getAllSessions();
    res.json(allSessions);
  } catch (error) {
    console.error('Failed to export sessions:', error);
    res.status(500).json({ error: 'Failed to export sessions' });
  }
});

// Manual trigger for timeout check
receiver.router.get('/check-timeouts', async (req, res) => {
  try {
    await checkAndCloseInactiveSessions(app.client);
    res.send('Timeout check triggered manually');
  } catch (error) {
    console.error('Error during manual timeout check:', error);
    res.status(500).send('Error during manual timeout check');
  }
});

const cronSchedule = `*/${CHECK_INTERVAL_MINUTES} * * * *`;

(async () => {
  try {
    await connectToDatabase();
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Bolt app is running on port', process.env.PORT || 3000);

    cron.schedule(cronSchedule, async () => {
      console.log(`Running cron job at ${new Date().toISOString()}`);
      try {
        await checkAndCloseInactiveSessions(app.client);
      } catch (error) {
        console.error('Error in cron job:', error);
      }
    });

    console.log(`Cron job scheduled to run every ${CHECK_INTERVAL_MINUTES} minutes`);
  } catch (error) {
    console.error('Failed to start the application:', error);
    process.exit(1);
  }
})();