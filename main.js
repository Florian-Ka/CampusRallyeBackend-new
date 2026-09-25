const express = require("express");
const https = require("https");
const dotenv = require("dotenv");
const cors = require('cors');


dotenv.config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

const sheetIdDE = process.env.SHEET_ID_DE;
const sheetIdEN = process.env.SHEET_ID_EN;

const getSheetUrl = (language) => {
    const sheetId = language === "de" ? sheetIdDE : sheetIdEN;

    if (!sheetId) {
        throw new Error(`Missing environment variable SHEET_ID_${language === "de" ? "DE" : "EN"}`);
    }

    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
};

const fetchSheetData = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let csvData = "";

            res.on("data", (chunk) => {
                csvData += chunk;
            });

            res.on("end", () => {
                resolve(csvToJson(csvData));
            });
        }).on("error", (err) => {
            reject("Error fetching Google Sheets: " + err.message);
        });
    });
};

function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (insideQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
            continue;
        }

        if (char === ',' && !insideQuotes) {
            cells.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current);
    return cells.map((cell) => cell.replace(/\r$/, "").trim());
}

function csvToJson(data) {
    const lines = data.replace(/\r/g, "").split("\n").filter((line) => line.trim());
    const jsonData = { questions: [] };

    lines.forEach((line) => {
        const cells = parseCsvLine(line);
        if (cells.length < 2) return;

        const rawKey = cells[0].trim();
        const rawValue = cells.slice(1).join(",").trim();

        const key = rawKey.replace(/^"|"$/g, "").replace(/""/g, '"');
        const value = rawValue.replace(/^"|"$/g, "").replace(/""/g, '"');

        if (key.startsWith("question_")) {
            const match = key.match(/^question_(\d+)(?:_(.+))?$/);
            if (!match) return;

            const index = Number(match[1]);
            const field = match[2];

            if (!jsonData.questions[index]) {
                jsonData.questions[index] = {};
            }

            if (field) {
                jsonData.questions[index][field] = value;
            }
        } else {
            jsonData[key] = value;
        }
    });

    jsonData.questions = jsonData.questions.filter(Boolean);
    return jsonData;
}


app.get("/", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});


// German Sheet Endpoint
app.get("/de", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("de"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});

// English Sheet Endpoint
app.get("/en", async (req, res) => {
    try {
        const data = await fetchSheetData(getSheetUrl("en"));
        res.json(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

app.csvToJson = csvToJson;
app.fetchSheetData = fetchSheetData;
app.getSheetUrl = getSheetUrl;

module.exports = app;