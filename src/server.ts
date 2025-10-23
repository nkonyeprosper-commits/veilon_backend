import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import privacyRoutes from "./routes/privacy";
import { proofGenerator } from "./services/proof-generator";

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "Veilon Relayer Service",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api/privacy", privacyRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

// Initialize proof generator and start server
async function startServer() {
  try {
    console.log("🚀 Starting Veilon Relayer Service...");

    // Initialize proof generator
    await proofGenerator.initialize();

    // Start listening
    app.listen(PORT, () => {
      console.log("");
      console.log("✅ Veilon Relayer Service is running!");
      console.log("");
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(
        `🛡️  Shield: POST http://localhost:${PORT}/api/privacy/shield`
      );
      console.log(
        `🔓 Unshield: POST http://localhost:${PORT}/api/privacy/unshield`
      );
      console.log("");
      console.log(
        "💡 Tip: Circuits are not compiled yet. Using mock proofs for development."
      );
      console.log(
        "   Run `bash scripts/compile-circuits.sh` to compile real circuits."
      );
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();
