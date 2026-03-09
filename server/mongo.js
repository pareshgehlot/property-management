// MongoDB connection utility for user management
const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'propertymanagement';

let client;
let db;

async function connect() {
  if (!client || !client.isConnected()) {
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
