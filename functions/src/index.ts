import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { z } from "zod";

admin.initializeApp();

// Define a schema for a single team's performance
const TeamStatsSchema = z.object({
  commander: z.string().min(1, "Commander name is required"),
  faction: z.string().min(1, "Faction is required"),
  thugs: z.array(z.string()).default([]),
  spendQuotient: z.number().optional(), // Optional per user "etc" implying potential optionality, but good to track
});

// Define the comprehensive Match schema
const MatchSubmissionSchema = z.object({
  winner: z.enum(["1", "2"]), // Identifying which team won
  durationSeconds: z.number().positive(),
  map: z.string().optional(),
  score: z.number().int(), // Game score
  timestamp: z.string().datetime().optional().default(() => new Date().toISOString()),
  
  team1: TeamStatsSchema,
  team2: TeamStatsSchema,
});

// Infer the TypeScript type
type MatchSubmission = z.infer<typeof MatchSubmissionSchema>;

export const submitMatchResult = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    // Validate the incoming request body
    const matchData: MatchSubmission = MatchSubmissionSchema.parse(req.body);

    functions.logger.info("Received valid match data", { 
      winner: matchData.winner,
      map: matchData.map 
    });

    // Save to Firestore
    const docRef = await admin.firestore().collection("matches").add({
      ...matchData,
      serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ 
      success: true, 
      id: docRef.id, 
      message: "Match recorded successfully" 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        error: "Validation Error", 
        details: error.errors 
      });
    } else {
      functions.logger.error("Internal Error", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
});