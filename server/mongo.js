// MongoDB connection utility for user management
// Note: .env must be loaded in index.js before this module is required
const { MongoClient } = require('mongodb');

let client;
let db;

async function connect() {
  if (!client || !client.topology || !client.topology.isConnected()) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set in environment variables. Check server/.env file.');
    }
    const dbName = process.env.MONGODB_DB || 'propertymanagement';
    client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect();
    db = client.db(dbName);
  }
  return db;
}

async function getUsersCollection() {
  const db = await connect();
  return db.collection('users');
}

module.exports = { connect, getUsersCollection };
