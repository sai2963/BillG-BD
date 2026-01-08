const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Routes
const productRoutes = require("./routes/products");
const billRoutes = require("./routes/bills");
const customerRoutes = require("./routes/customers");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhook");
const zoomRoutes = require('./routes/zoom');

const app = express();
const PORT = process.env.PORT || 5000;

/* =======================
   SECURITY MIDDLEWARE
======================= */
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

/* =======================
   CORS
======================= */
app.use(
  cors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",")
      : [
          "http://localhost:3000",
          "http://localhost:5173",
          "https://bill-g.vercel.app",
        ],
    credentials: true,
  })
);

/* ======================================================
   🚨 STRIPE WEBHOOK (MUST BE BEFORE express.json)
====================================================== */
app.use(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes
);

/* =======================
   BODY PARSERS
======================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =======================
   LOGGER
======================= */
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

/* =======================
   API ROUTES
======================= */
app.use("/api/products", productRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/zoom", zoomRoutes);

/* =======================
   HEALTH CHECK
======================= */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/* =======================
   404 HANDLER
======================= */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

/* =======================
   GLOBAL ERROR HANDLER
======================= */
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);

  if (err.code === "P2002") {
    return res.status(400).json({
      error: "Duplicate entry",
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      error: "Record not found",
    });
  }

  res.status(err.status || 500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message,
  });
});

/* =======================
   GRACEFUL SHUTDOWN
======================= */
process.on("SIGINT", async () => {
  console.log("🛑 SIGINT received. Closing Prisma...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received. Closing Prisma...");
  await prisma.$disconnect();
  process.exit(0);
});

/* =======================
   START SERVER
======================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`❤️ Health: http://localhost:${PORT}/api/health`);
});
