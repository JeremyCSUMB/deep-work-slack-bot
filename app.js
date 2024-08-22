const { App, ExpressReceiver } = require('@slack/bolt');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  processBeforeResponse: true
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectToDatabase() {
  try {
    console.log('MongoDB URI:', process.env.MONGODB_URI);
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

app.command('/deepwork', async ({ command, ack, say, client }) => {
  await ack();
  const userId = command.user_id;

  const userSessions = await getSessionsByUser(userId);
  const activeSession = userSessions.find(session => !session.endTime);

  if (activeSession) {
    const endTime = new Date();
    const duration = Math.round((endTime - activeSession.startTime) / 60000);

    await storeSession({
      ...activeSession,
      endTime: endTime,
      duration: duration
    });

    await say(`<@${userId}> has ended their deep work session (duration: ${duration} minutes)`);
  } else {
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

receiver.router.get('/export-sessions', async (req, res) => {
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