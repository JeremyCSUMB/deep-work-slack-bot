const { App, ExpressReceiver } = require('@slack/bolt');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true,
  endpoints: '/slack/events',
});

// Add explicit URL verification handler
expressReceiver.router.post('/slack/events', (req, res) => {
  if (req.body.type === 'url_verification') {
    res.send(req.body.challenge);
  }
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver
});

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectToDatabase() {
  try {
    // Log the MongoDB URI to verify it's being set correctly
    console.log('MongoDB URI:', process.env.MONGODB_URI);

    await mongoClient.connect();
    console.log('Connected to MongoDB');
    
    // Log the actual database name being used
    db = mongoClient.db('deep_work_tracker'); // You could make this dynamic if needed
    console.log('Using Database:', db.databaseName);

  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
}


async function storeSession(session) {
  const sessions = db.collection('sessions');
  
  if (session._id) {
    // If _id exists, it's an update to an existing session
    await sessions.updateOne(
      { _id: session._id },
      { $set: session },
      { upsert: true }
    );
  } else {
    // If no _id, it's a new session
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

app.command('/deepwork', async ({ command, ack, say, client }) => {
  await ack();
  const userId = command.user_id;

  const userSessions = await getSessionsByUser(userId);
  const activeSession = userSessions.find(session => !session.endTime);

  if (activeSession) {
    // End the session
    const endTime = new Date();
    const duration = Math.round((endTime - activeSession.startTime) / 60000);

    await storeSession({
      ...activeSession,
      endTime: endTime,
      duration: duration
    });

    await say(`<@${userId}> has ended their deep work session (duration: ${duration} minutes)`);
  } else {
    // Start a new session
    const userInfo = await client.users.info({ user: userId });
    const newSession = {
      userId: userId,
      name: userInfo.user.real_name,
      email: userInfo.user.profile.email,
      startTime: new Date(),
      channelId: command.channel_id
    };

    await storeSession(newSession);
    await say(`<@${userId}> has started a deep work session`);
  }
});

expressReceiver.router.get('/export-sessions', async (req, res) => {
  try {
    const allSessions = await getAllSessions();
    res.json(allSessions);
  } catch (error) {
    console.error('Failed to export sessions:', error);
    res.status(500).json({ error: 'Failed to export sessions' });
  }
});

(async () => {
  await connectToDatabase();
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running on port', process.env.PORT || 3000);
})();