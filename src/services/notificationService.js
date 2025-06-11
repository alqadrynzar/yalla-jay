const admin = require('../config/firebaseAdmin.js');
const pool = require('../config/database.js');

const sendPushNotification = async (userId, title, body, data = {}) => {
  if (!userId || !title || !body) {
    console.error('sendPushNotification: Missing required parameters (userId, title, body).');
    return;
  }

  const client = await pool.connect();
  try {
    const tokenQuery = 'SELECT token FROM user_fcm_tokens WHERE user_id = $1';
    const tokenResult = await client.query(tokenQuery, [userId]);
    const tokens = tokenResult.rows.map(row => row.token);

    if (tokens.length === 0) {
      console.log(`No FCM tokens found for user_id: ${userId}. Skipping push notification.`);
      return;
    }

    // The message payload for sendEachForMulticast is an object
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data,
      tokens: tokens,
    };

    console.log(`Attempting to send push notification to user_id: ${userId} for title: ${title}`);

    // CORRECTED: Using sendEachForMulticast
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(`${response.successCount} messages were sent successfully`);

    if (response.failureCount > 0) {
      const tokensToDelete = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          const error = resp.error;
          console.error('Failure sending notification to', tokens[index], error);
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            tokensToDelete.push(tokens[index]);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        console.log('Deleting stale FCM tokens:', tokensToDelete);
        const deleteQuery = 'DELETE FROM user_fcm_tokens WHERE token = ANY($1::text[])';
        await client.query(deleteQuery, [tokensToDelete]);
      }
    }

  } catch (err) {
    console.error('Error in sendPushNotification service:', err);
  } finally {
    client.release();
  }
};

module.exports = {
  sendPushNotification,
};
