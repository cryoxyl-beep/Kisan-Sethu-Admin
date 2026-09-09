import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
    }

    const serviceAccount = JSON.parse(serviceAccountKey);
    const databaseURL = process.env.VITE_FIREBASE_DATABASE_URL || process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: databaseURL
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { farmerId, title, body } = req.body;

  if (!farmerId || !title || !body) {
    return res.status(400).json({ success: false, error: 'Missing farmerId, title, or body' });
  }

  try {
    const rtdb = admin.database();
    const devicesRef = rtdb.ref(`farmers/${farmerId}/devices`);
    const snapshot = await devicesRef.once("value");

    if (!snapshot.exists()) {
      return res.status(404).json({ success: false, error: 'No registered devices found for farmer' });
    }

    const devices = snapshot.val();
    const tokens: string[] = [];

    // Extract FCM tokens from Realtime Database
    for (const deviceId in devices) {
      const deviceData = devices[deviceId];
      if (typeof deviceData === 'string') {
        // Fallback for flat structure
        tokens.push(deviceData);
      } else if (deviceData && typeof deviceData === 'object' && deviceData.fcmToken) {
        // Expected structure: farmers/{farmerId}/devices/{deviceId}/fcmToken
        tokens.push(deviceData.fcmToken);
      }
    }

    if (tokens.length === 0) {
      return res.status(404).json({ success: false, error: 'No FCM tokens found in device entries' });
    }

    const message = {
      notification: {
        title,
        body,
      },
      tokens, // Multicast payload
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Optional: Log failures if some tokens were invalid
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${tokens[idx]}: ${resp.error}`);
        }
      });
    }

    return res.status(200).json({ success: true, response });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}
