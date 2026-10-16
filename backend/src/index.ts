import express from "express";

const app = express();
const port = 3000;

app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({
        status: "OK",
        message: "24 Game backend is running!"
    });
});

app.listen(port, () => {
    console.log(`Backend server is running at http://localhost:${port}`);
});