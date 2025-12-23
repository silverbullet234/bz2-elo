"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitMatchResult = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const zod_1 = require("zod");
admin.initializeApp();
// Define a schema for a single team's performance
const TeamStatsSchema = zod_1.z.object({
    commander: zod_1.z.string().min(1, "Commander name is required"),
    faction: zod_1.z.string().min(1, "Faction is required"),
    thugs: zod_1.z.array(zod_1.z.string()).default([]),
    spendQuotient: zod_1.z.number().optional(), // Optional per user "etc" implying potential optionality, but good to track
});
// Define the comprehensive Match schema
const MatchSubmissionSchema = zod_1.z.object({
    winner: zod_1.z.enum(["1", "2"]),
    durationSeconds: zod_1.z.number().positive(),
    map: zod_1.z.string().optional(),
    score: zod_1.z.number().int(),
    timestamp: zod_1.z.string().datetime().optional().default(() => new Date().toISOString()),
    team1: TeamStatsSchema,
    team2: TeamStatsSchema,
});
exports.submitMatchResult = functions.https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    try {
        // Validate the incoming request body
        const matchData = MatchSubmissionSchema.parse(req.body);
        functions.logger.info("Received valid match data", {
            winner: matchData.winner,
            map: matchData.map
        });
        // Save to Firestore
        const docRef = await admin.firestore().collection("matches").add(Object.assign(Object.assign({}, matchData), { serverTimestamp: admin.firestore.FieldValue.serverTimestamp() }));
        res.status(200).json({
            success: true,
            id: docRef.id,
            message: "Match recorded successfully"
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({
                error: "Validation Error",
                details: error.errors
            });
        }
        else {
            functions.logger.error("Internal Error", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
});
//# sourceMappingURL=index.js.map