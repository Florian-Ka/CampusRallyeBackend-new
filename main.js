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

const fetchRawSheetData = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = "";

            res.on("data", (chunk) => {
                data += chunk;
            });

            res.on("end", () => {
                resolve(data);
            });
        }).on("error", (err) => {
            reject("Error fetching raw Google Sheets data: " + err.message);
        });
    });
};

function normalizeText(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/^\s+|\s+$/g, "")
        .replace(/""/g, '"');
}

function parseCsvRows(data) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < data.length; index += 1) {
        const character = data[index];
        const nextCharacter = data[index + 1];

        if (character === '"') {
            if (quoted && nextCharacter === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(cell);
            cell = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && nextCharacter === "\n") index += 1;
            row.push(cell);
            if (row.some((value) => value !== "")) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
}

function extractKeyValuePairs(data) {
    const rows = parseCsvRows(data);
    const entries = {};

    if (rows.length >= 2 && rows[0].length > 2) {
        rows[0].forEach((key, index) => {
            if (key && rows[1][index] !== undefined) {
                entries[normalizeText(key)] = normalizeText(rows[1][index]);
            }
        });
        rows.splice(0, 2);
    }

    rows.forEach((columns) => {
        const key = normalizeText(columns[0]);
        if (!key) return;
        entries[key] = normalizeText(columns.slice(1).join(","));
    });

    return entries;
}

function csvToJson(data) {
    const text = normalizeText(data);
    const entries = extractKeyValuePairs(text);
    const jsonData = { questions: [] };

    Object.entries(entries).forEach(([key, value]) => {
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


app.get("/raw", async (req, res) => {
    try {
        const url = getSheetUrl(req.query.lang === "en" ? "en" : "de");
        const data = await fetchRawSheetData(url);
        res.type("text/plain").send(data);
    } catch (error) {
        res.status(500).json({ error });
    }
});

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