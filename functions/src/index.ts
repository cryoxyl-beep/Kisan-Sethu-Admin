import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

admin.initializeApp();

const NEAR_TURN_THRESHOLD = 3;

// Trigger on queueEntries updates
export const onQueueEntryUpdated = functions.firestore
  .document("queueEntries/{queueEntryId}")
  .onUpdate(async (change: functions.Change<functions.firestore.DocumentSnapshot>, context: functions.EventContext) => {
    const previousData = change.before.data();
    const newData = change.after.data();

    if (!previousData || !newData) return;

    const previousStatus = previousData.status;
    const newStatus = newData.status;

    // Only proceed if status changed
    if (previousStatus === newStatus) {
      return;
    }

    const bookingId = newData.bookingId || context.params.queueEntryId;
    const farmerId = newData.farmerId;
    const queueToken = newData.tokenLabel || newData.tokenNumber;

    if (!farmerId) {
      console.log(`No farmerId found for queueEntry ${context.params.queueEntryId}`);
      return;
    }

    let title = "";
    let body = "";
    let eventType = "";

    if (previousStatus === "WAITING" && newStatus === "NOW_SERVING") {
      title = "Your turn is now";
      body = `Token ${queueToken} is now being served. Please proceed to the procurement counter.`;
      eventType = "NOW_SERVING";
    } else if (newStatus === "PROCESSING") {
      title = "Procurement started";
      body = "Your procurement process has started.";
      eventType = "PROCESSING";
    } else if (newStatus === "COMPLETED") {
      title = "Procurement completed";
      body = "Your procurement process has been completed.";
      eventType = "COMPLETED";
    }

    if (!eventType) {
      return;
    }

    await sendNotification(farmerId, bookingId, title, body, eventType, queueToken, previousStatus, newStatus);
  });

// Trigger on queueEntries creates (CHECKED_IN -> WAITING)
export const onQueueEntryCreated = functions.firestore
  .document("queueEntries/{queueEntryId}")
  .onCreate(async (snap: functions.firestore.DocumentSnapshot, context: functions.EventContext) => {
    const newData = snap.data();
    if (!newData) return;
    
    if (newData.status !== "WAITING") {
      return;
    }

    const bookingId = newData.bookingId || context.params.queueEntryId;
    const farmerId = newData.farmerId;
    const queueToken = newData.tokenLabel || newData.tokenNumber;

    if (!farmerId) {
      return;
    }

    const title = "You're in the queue";
    const body = `You're now in the queue. Your token is ${queueToken}.`;
    const eventType = "QUEUE_ENTERED";

    await sendNotification(farmerId, bookingId, title, body, eventType, queueToken, "NONE", "WAITING");
  });

// Check near-turn whenever a farmer is removed from WAITING
export const onQueueEntryWaitingRemoved = functions.firestore
  .document("queueEntries/{queueEntryId}")
  .onUpdate(async (change: functions.Change<functions.firestore.DocumentSnapshot>) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    
    if (!beforeData || !afterData) return;

    const previousStatus = beforeData.status;
    const newStatus = afterData.status;

    if (previousStatus === "WAITING" && newStatus !== "WAITING") {
      const centreId = afterData.centreId;
      const queueDate = afterData.queueDate;

      // Find the Nth waiting farmer
      const snapshot = await getFirestore().collection("queueEntries")
        .where("centreId", "==", centreId)
        .where("queueDate", "==", queueDate)
        .where("status", "==", "WAITING")
        .orderBy("queueJoinedAt", "asc")
        .limit(NEAR_TURN_THRESHOLD)
        .get();

      if (snapshot.size === NEAR_TURN_THRESHOLD) {
        const targetDoc = snapshot.docs[NEAR_TURN_THRESHOLD - 1];
        const targetData = targetDoc.data();
        const targetBookingId = targetData.bookingId || targetDoc.id;
        const targetFarmerId = targetData.farmerId;
        const targetQueueToken = targetData.tokenLabel || targetData.tokenNumber;

        // Idempotency check for NEAR_TURN
        const idempotencyKey = `${targetBookingId}_NEAR_TURN`;
        const eventRef = getFirestore().collection("notificationEvents").doc(idempotencyKey);
        
        await getFirestore().runTransaction(async (t: FirebaseFirestore.Transaction) => {
          const doc = await t.get(eventRef);
          if (doc.exists) {
            return; // Already notified
          }
          t.set(eventRef, {
            bookingId: targetBookingId,
            event: "NEAR_TURN",
            timestamp: FieldValue.serverTimestamp()
          });

          // Send notification
          await sendNotification(
            targetFarmerId, 
            targetBookingId, 
            "You're almost up", 
            `Only ${NEAR_TURN_THRESHOLD - 1} farmers are ahead of you.`, 
            "NEAR_TURN", 
            targetQueueToken, 
            "N/A", 
            "N/A",
            true // bypass standard idempotency since we just checked it
          );
        });
      }
    }
  });


async function sendNotification(
  farmerId: string, 
  bookingId: string, 
  title: string, 
  body: string, 
  eventType: string, 
  queueToken: any,
  previousStatus: string,
  newStatus: string,
  skipIdempotency: boolean = false
) {
  const db = getFirestore();
  
  if (!skipIdempotency) {
    const idempotencyKey = `${bookingId}_${previousStatus}_${newStatus}`;
    const eventRef = db.collection("notificationEvents").doc(idempotencyKey);
    
    try {
      await db.runTransaction(async (t: FirebaseFirestore.Transaction) => {
        const doc = await t.get(eventRef);
        if (doc.exists) {
          throw new Error("ALREADY_SENT");
        }
        t.set(eventRef, {
          bookingId,
          previousStatus,
          newStatus,
          eventType,
          timestamp: FieldValue.serverTimestamp()
        });
      });
    } catch (e: any) {
      if (e.message === "ALREADY_SENT") {
        console.log(`Notification for ${eventType} on booking ${bookingId} already sent.`);
        return;
      }
      throw e;
    }
  }

  // Get tokens
  const rtdb = getDatabase();
  const devicesRef = rtdb.ref(`farmers/${farmerId}/devices`);
  const snapshot = await devicesRef.once("value");
  
  if (!snapshot.exists()) {
    console.log(`No registered devices found for farmer ${farmerId}`);
    return;
  }

  const devices = snapshot.val();
  const tokens = Object.values(devices) as string[];

  if (tokens.length === 0) {
    console.log(`No tokens found for farmer ${farmerId}`);
    return;
  }

  const payload = {
    notification: {
      title,
      body,
    },
    data: {
      bookingId: String(bookingId),
      farmerId: String(farmerId),
      eventType: String(eventType),
      queueToken: String(queueToken),
    },
    tokens: tokens,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(payload);
    console.log(`Successfully sent messages: ${response.successCount}`);
    if (response.failureCount > 0) {
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          console.error(`Failed to send to token ${tokens[idx]}: ${resp.error}`);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending FCM multicast:`, error);
  }
}
