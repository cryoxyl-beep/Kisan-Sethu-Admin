"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onQueueEntryWaitingRemoved = exports.onQueueEntryCreated = exports.onQueueEntryUpdated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const database_1 = require("firebase-admin/database");
const messaging_1 = require("firebase-admin/messaging");
admin.initializeApp();
const NEAR_TURN_THRESHOLD = 3;
// Trigger on queueEntries updates
exports.onQueueEntryUpdated = functions.firestore
    .document("queueEntries/{queueEntryId}")
    .onUpdate(async (change, context) => {
    const previousData = change.before.data();
    const newData = change.after.data();
    if (!previousData || !newData)
        return;
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
    }
    else if (newStatus === "PROCESSING") {
        title = "Procurement started";
        body = "Your procurement process has started.";
        eventType = "PROCESSING";
    }
    else if (newStatus === "COMPLETED") {
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
exports.onQueueEntryCreated = functions.firestore
    .document("queueEntries/{queueEntryId}")
    .onCreate(async (snap, context) => {
    const newData = snap.data();
    if (!newData)
        return;
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
exports.onQueueEntryWaitingRemoved = functions.firestore
    .document("queueEntries/{queueEntryId}")
    .onUpdate(async (change) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    if (!beforeData || !afterData)
        return;
    const previousStatus = beforeData.status;
    const newStatus = afterData.status;
    if (previousStatus === "WAITING" && newStatus !== "WAITING") {
        const centreId = afterData.centreId;
        const queueDate = afterData.queueDate;
        // Find the Nth waiting farmer
        const snapshot = await (0, firestore_1.getFirestore)().collection("queueEntries")
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
            const eventRef = (0, firestore_1.getFirestore)().collection("notificationEvents").doc(idempotencyKey);
            await (0, firestore_1.getFirestore)().runTransaction(async (t) => {
                const doc = await t.get(eventRef);
                if (doc.exists) {
                    return; // Already notified
                }
                t.set(eventRef, {
                    bookingId: targetBookingId,
                    event: "NEAR_TURN",
                    timestamp: firestore_1.FieldValue.serverTimestamp()
                });
                // Send notification
                await sendNotification(targetFarmerId, targetBookingId, "You're almost up", `Only ${NEAR_TURN_THRESHOLD - 1} farmers are ahead of you.`, "NEAR_TURN", targetQueueToken, "N/A", "N/A", true // bypass standard idempotency since we just checked it
                );
            });
        }
    }
});
async function sendNotification(farmerId, bookingId, title, body, eventType, queueToken, previousStatus, newStatus, skipIdempotency = false) {
    const db = (0, firestore_1.getFirestore)();
    if (!skipIdempotency) {
        const idempotencyKey = `${bookingId}_${previousStatus}_${newStatus}`;
        const eventRef = db.collection("notificationEvents").doc(idempotencyKey);
        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(eventRef);
                if (doc.exists) {
                    throw new Error("ALREADY_SENT");
                }
                t.set(eventRef, {
                    bookingId,
                    previousStatus,
                    newStatus,
                    eventType,
                    timestamp: firestore_1.FieldValue.serverTimestamp()
                });
            });
        }
        catch (e) {
            if (e.message === "ALREADY_SENT") {
                console.log(`Notification for ${eventType} on booking ${bookingId} already sent.`);
                return;
            }
            throw e;
        }
    }
    // Get tokens
    const rtdb = (0, database_1.getDatabase)();
    const devicesRef = rtdb.ref(`farmers/${farmerId}/devices`);
    const snapshot = await devicesRef.once("value");
    if (!snapshot.exists()) {
        console.log(`No registered devices found for farmer ${farmerId}`);
        return;
    }
    const devices = snapshot.val();
    const tokens = Object.values(devices);
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
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast(payload);
        console.log(`Successfully sent messages: ${response.successCount}`);
        if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.error(`Failed to send to token ${tokens[idx]}: ${resp.error}`);
                }
            });
        }
    }
    catch (error) {
        console.error(`Error sending FCM multicast:`, error);
    }
}
//# sourceMappingURL=index.js.map